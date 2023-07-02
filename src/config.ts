import 'dotenv/config';
import { WorkerLogLevel, WorkerLogTag } from 'mediasoup/node/lib/Worker';
import { RtpCodecCapability } from 'mediasoup/node/lib/RtpParameters';

export default {
    listenIp: (process.env.SOCKET_SERVER_IP || '0.0.0.0') as string,
    listenPort: (process.env.PORT || 3000) as number,
    sslCrt: './.cert/cert.pem',
    sslKey: './.cert/key.pem',
    mediaSoup: {
        worker: {
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
            logLevel: 'warn' as WorkerLogLevel,
            logTags: [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp',
                // 'rtx',
                // 'bwe',
                // 'score',
                // 'simulcast',
                // 'svc'
            ] as WorkerLogTag[],
        },
        router: {
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2,
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000,
                    parameters: {
                        'x-google-start-bitrate': 1000,
                    },
                },
            ] as RtpCodecCapability[],
        },
        webRtcTransport: {
            listenIps: [
                {
                    ip: process.env.SOCKET_SERVER_IP || '0.0.0.0',
                    announcedIp: undefined,
                },
            ],
            maxIncomingBitrate: 1500000,
            initialAvailableOutgoingBitrate: 1000000,
        },
    },
};
