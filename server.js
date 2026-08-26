const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

const server = http.createServer(app);

// =====================================================
// CORS
// =====================================================

const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "https://sih-26-cyan.vercel.app";

app.use(
    cors({
        origin: FRONTEND_URL,
        methods: ["GET", "POST"],
    })
);

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ["GET", "POST"],
    },

    // Keep connections alive
    pingInterval: 25000,
    pingTimeout: 20000,

    transports: ["websocket", "polling"],
});

// =====================================================
// DEVICE STATE
// =====================================================

const devices = new Map();

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        service: "SiloSense Socket Server",
        status: "running",
        timestamp: new Date().toISOString(),
    });
});

// =====================================================
// SOCKET.IO
// =====================================================

io.on("connection", (socket) => {

    console.log(
        `[Socket.IO] Client connected: ${socket.id}`
    );

    // =================================================
    // DEVICE CONNECTED
    // =================================================

    socket.on("deviceConnected", (data) => {

        if (!data || !data.deviceId) {

            console.warn(
                "[Device] Invalid deviceConnected payload"
            );

            return;
        }

        const deviceId = data.deviceId;

        // Store device
        devices.set(deviceId, {
            deviceId,
            socketId: socket.id,
            connected: true,
            connectedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
        });

        // Attach device ID to socket
        socket.deviceId = deviceId;

        console.log(
            `[Device] ${deviceId} CONNECTED`
        );

        // =============================================
        // INFORM ALL DASHBOARD CLIENTS
        // =============================================

        io.emit("deviceStatus", {
            deviceId,
            connected: true,
            lastSeen: new Date().toISOString(),
        });
    });

    // =================================================
    // SENSOR DATA
    // =================================================

    socket.on("sensorData", (data) => {

        if (!data || !data.deviceId) {

            console.warn(
                "[Sensor] Invalid sensor data"
            );

            return;
        }

        const deviceId = data.deviceId;

        // Update last seen
        const existingDevice =
            devices.get(deviceId);

        devices.set(deviceId, {
            ...(existingDevice || {}),
            deviceId,
            socketId: socket.id,
            connected: true,
            lastSeen: new Date().toISOString(),
        });

        // =============================================
        // SEND SENSOR DATA TO DASHBOARD
        // =============================================

        io.emit(
            "sensorData",
            data
        );
    });

    // =================================================
    // DASHBOARD REQUESTS CURRENT DEVICES
    // =================================================

    socket.on("getDevices", () => {

        socket.emit(
            "deviceList",
            Array.from(
                devices.values()
            )
        );
    });

    // =================================================
    // DISCONNECT
    // =================================================

    socket.on("disconnect", (reason) => {

        console.log(
            `[Socket.IO] Client disconnected: ${socket.id}`
        );

        console.log(
            `[Socket.IO] Reason: ${reason}`
        );

        const deviceId =
            socket.deviceId;

        if (!deviceId) {

            return;
        }

        const device =
            devices.get(deviceId);

        // Only mark offline if this socket is
        // still the socket registered for device.

        if (
            device &&
            device.socketId === socket.id
        ) {

            devices.set(deviceId, {
                ...device,
                connected: false,
                disconnectedAt:
                    new Date().toISOString(),
                lastSeen:
                    new Date().toISOString(),
            });

            // =========================================
            // INFORM DASHBOARD
            // =========================================

            io.emit(
                "deviceStatus",
                {
                    deviceId,
                    connected: false,
                    lastSeen:
                        new Date().toISOString(),
                    reason,
                }
            );

            console.log(
                `[Device] ${deviceId} DISCONNECTED`
            );
        }
    });
});

// =====================================================
// SERVER
// =====================================================

const PORT =
    process.env.PORT || 4000;

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `SiloSense Socket Server listening on port ${PORT}`
        );

        console.log(
            `Frontend: ${FRONTEND_URL}`
        );
    }
);