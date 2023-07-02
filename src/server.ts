import { Express, NextFunction, Request, Response } from 'express';
import * as express from 'express';
import {
    Server as HttpsServer,
    createServer as createHttpsServer,
} from 'https';
import config from './config';
import * as fs from 'fs';
import { Server as SocketServer } from 'socket.io';
import { createWorker } from 'mediasoup';
import { Producer } from 'mediasoup/node/lib/Producer';
import { Transport } from 'mediasoup/node/lib/Transport';
import { Consumer } from 'mediasoup/node/lib/Consumer';
import { Router } from 'mediasoup/node/lib/Router';
import { Worker } from 'mediasoup/node/lib/Worker';
import { OutputDecodedToken } from '../../debate-zone-micro-service-common-library/src/types/auth';
import { verify } from '../../debate-zone-micro-service-common-library/src/auth/token';

let expressApp: Express;
let webServer: HttpsServer;
let socketServer: SocketServer;
let producer: Producer;
let producerTransport: Transport;
let consumer: Consumer;
let consumerTransport: Transport;
let mediaSoupRouter: Router;
let worker: Worker;

(async () => {
    try {
        await runExpressApp();
        await runWebServer();
        await runSocketServer();
        await runMediaSoupWorker();
    } catch (err: any) {
        console.error(err);
    }
})();

async function runExpressApp() {
    expressApp = express();
    expressApp.use(express.json());
    expressApp.use(express.static(__dirname));

    expressApp.use(
        (error: any, req: Request, res: Response, next: NextFunction) => {
            if (error) {
                console.warn('Express app error,', error.message);

                error.status =
                    error.status || (error.name === 'TypeError' ? 400 : 500);

                res.statusMessage = error.message;
                res.status(error.status).send(String(error));
            } else {
                next();
            }
        },
    );
}

async function runWebServer() {
    const { sslKey, sslCrt } = config;
    if (!fs.existsSync(sslKey) || !fs.existsSync(sslCrt)) {
        console.error('SSL files are not found. check your config file');
        process.exit(0);
    }
    const tls = {
        cert: fs.readFileSync(sslCrt),
        key: fs.readFileSync(sslKey),
    };
    webServer = createHttpsServer(tls, expressApp);
    webServer.on('error', err => {
        console.error('starting web server failed:', err.message);
    });

    await new Promise(resolve => {
        const { listenIp, listenPort } = config;

        webServer.listen(listenPort, listenIp, () => {
            const listenIps = config.mediaSoup.webRtcTransport.listenIps[0];
            const ip = listenIps.announcedIp || listenIps.ip;
            console.log(listenIps);
            console.info('server is running');
            console.info(
                `open https://${ip}:${listenPort} in your web browser`,
            );
            resolve('done');
        });
    });
}

async function runSocketServer() {
    socketServer = new SocketServer(webServer).on(
        'connection',
        async socket => {
            let userId: string = '';

            // const token = socket.handshake.auth.token;
            //
            // if (token) {
            //     const outputDecodedToken: OutputDecodedToken = await verify(
            //         token,
            //     );
            //
            //     userId = outputDecodedToken.userId;
            // } else {
            //     throw new Error(`Can't find token in auth. Token: ${token}`);
            // }

            const deviceName = socket.handshake.query.deviceName as string;
            const debateZoneId =
                (socket.handshake.query.debateZoneId as string) ||
                '64a0a221ef6344a03a89a5b7';

            if (!debateZoneId) {
                throw new Error(
                    `Can't join to debateZoneId ${debateZoneId}. Not found in query params`,
                );
            } else {
                socket.join(debateZoneId);
                console.info(
                    `User with "${socket.id}"(socketId) & ${userId}(userId) connected to room: ${debateZoneId}(debateZoneId) from: ${deviceName}(deviceName)`,
                );
            }

            if (producer) {
                socket.emit('newProducer');
            }

            socket.on('disconnect', () => {
                socket.leave(debateZoneId);

                console.info(
                    `User with "${socket.id}"(socketId) disconnected & ${userId}(userId) disconnected from: ${deviceName}(deviceName)`,
                );
            });

            socket.on('connect_error', err => {
                console.error('client connection error', err);
            });

            socket.on('getRouterRtpCapabilities', (data, callback) => {
                callback(mediaSoupRouter.rtpCapabilities);
            });

            socket.on('createProducerTransport', async (data, callback) => {
                console.log('createProducerTransport');
                try {
                    const { transport, params } = await createWebRtcTransport();
                    producerTransport = transport;
                    callback(params);
                } catch (err: any) {
                    console.error(err);
                    callback({ error: err.message });
                }
            });

            socket.on('createConsumerTransport', async (data, callback) => {
                try {
                    const { transport, params } = await createWebRtcTransport();
                    consumerTransport = transport;
                    callback(params);
                } catch (err: any) {
                    console.error(err);
                    callback({ error: err.message });
                }
            });

            socket.on('connectProducerTransport', async (data, callback) => {
                await producerTransport.connect({
                    dtlsParameters: data.dtlsParameters,
                });
                callback();
            });

            socket.on('connectConsumerTransport', async (data, callback) => {
                await consumerTransport.connect({
                    dtlsParameters: data.dtlsParameters,
                });
                callback();
            });

            socket.on('produce', async (data, callback) => {
                const { kind, rtpParameters } = data;
                producer = await producerTransport.produce({
                    kind,
                    rtpParameters,
                });
                callback({ id: producer.id });

                socket.broadcast.emit('newProducer');
            });

            socket.on('consume', async (data, callback) => {
                callback(await createConsumer(producer, data.rtpCapabilities));
            });

            socket.on('resume', async (data, callback) => {
                await consumer.resume();
                callback();
            });
        },
    );
}

async function runMediaSoupWorker() {
    worker = await createWorker({
        logLevel: config.mediaSoup.worker.logLevel,
        logTags: config.mediaSoup.worker.logTags,
        rtcMinPort: config.mediaSoup.worker.rtcMinPort,
        rtcMaxPort: config.mediaSoup.worker.rtcMaxPort,
    });

    worker.on('died', () => {
        console.error(
            'MediaSoup worker died, exiting in 2 seconds... [pid:%d]',
            worker.pid,
        );
        setTimeout(() => process.exit(1), 2000);
    });

    const mediaCodecs = config.mediaSoup.router.mediaCodecs;
    mediaSoupRouter = await worker.createRouter({ mediaCodecs });
}

async function createWebRtcTransport() {
    const { maxIncomingBitrate, initialAvailableOutgoingBitrate } =
        config.mediaSoup.webRtcTransport;

    const transport = await mediaSoupRouter.createWebRtcTransport({
        listenIps: config.mediaSoup.webRtcTransport.listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate,
    });
    if (maxIncomingBitrate) {
        try {
            await transport.setMaxIncomingBitrate(maxIncomingBitrate);
        } catch (error) {
            console.error(error);
        }
    }
    return {
        transport,
        params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        },
    };
}

async function createConsumer(producer: any, rtpCapabilities: any) {
    if (
        !mediaSoupRouter.canConsume({
            producerId: producer.id,
            rtpCapabilities,
        })
    ) {
        console.error('can not consume');
        return;
    }
    try {
        consumer = await consumerTransport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: producer.kind === 'video',
        });
    } catch (error) {
        console.error('consume failed', error);
        return;
    }

    if (consumer.type === 'simulcast') {
        await consumer.setPreferredLayers({
            spatialLayer: 2,
            temporalLayer: 2,
        });
    }

    return {
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
    };
}
