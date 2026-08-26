    const express = require("express");
    const http = require("http");
    const { Server } = require("socket.io");
    const cors = require("cors");

    const app = express();
    const server = http.createServer(app);

    // Allowed origins setup
    const FRONTEND_URL = process.env.FRONTEND_URL || "https://sih-26-cyan.vercel.app";

    const allowedOrigins = [
    FRONTEND_URL,
    "https://sih-26-cyan.vercel.app",
    "http://localhost:3000",
    "http://localhost:5000"
    ];

    // Express Middleware
    app.use(express.json());
    app.use(
    cors({
        origin: (origin, callback) => {
        // Allow non-browser agents (e.g. ESP32, Postman) or listed origins
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(null, true); // Fallback allow to avoid CORS block on sockets
        },
        methods: ["GET", "POST"],
        credentials: true
    })
    );

    // Socket.IO Setup with backward compatibility for ESP32
    const io = new Server(server, {
    cors: {
        origin: "*", // Wide open for WebSockets to allow C++ microcontrollers
        methods: ["GET", "POST"]
    },
    allowEIO3: true, // CRITICAL: Enables compatibility for ESP32 SocketIOclient library
    pingInterval: 2000,
    pingTimeout: 2000,
    transports: ["websocket", "polling"]
    });

    // Device state tracking
    const devices = new Map();

    // Health Check
    app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        service: "SiloSense Socket Server",
        status: "running",
        connectedDevices: devices.size,
        timestamp: new Date().toISOString()
    });
    });

    // Socket Event Loop
    io.on("connection", (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Device Registration
    socket.on("deviceConnected", (data) => {
        let parsedData = data;
        
        // Parse stringified JSON payloads sent by microcontrollers
        if (typeof data === "string") {
        try {
            parsedData = JSON.parse(data);
        } catch (err) {
            console.error("[Device] JSON parse error:", err);
        }
        }

        if (!parsedData || !parsedData.deviceId) {
        console.warn("[Device] Invalid deviceConnected payload:", data);
        return;
        }

        const deviceId = parsedData.deviceId;

        devices.set(deviceId, {
        deviceId,
        socketId: socket.id,
        connected: true,
        connectedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
        });

        socket.deviceId = deviceId;
        console.log(`[Device] ${deviceId} CONNECTED`);

        io.emit("deviceStatus", {
        deviceId,
        connected: true,
        lastSeen: new Date().toISOString()
        });
    });

    // Sensor Data Telemetry
    socket.on("sensorData", (data) => {
        let parsedData = data;

        if (typeof data === "string") {
        try {
            parsedData = JSON.parse(data);
        } catch (err) {
            console.error("[Sensor] JSON parse error:", err);
        }
        }

        if (!parsedData || !parsedData.deviceId) {
        console.warn("[Sensor] Invalid sensor data received:", data);
        return;
        }

        const deviceId = parsedData.deviceId;
        const existingDevice = devices.get(deviceId);

        devices.set(deviceId, {
        ...(existingDevice || {}),
        deviceId,
        socketId: socket.id,
        connected: true,
        lastSeen: new Date().toISOString()
        });

        // Relay data to Vercel Next.js/React frontend dashboard
        io.emit("sensorData", parsedData);
    });

    // Dashboard Request
    socket.on("getDevices", () => {
        socket.emit("deviceList", Array.from(devices.values()));
    });

    // Disconnect Handler
    socket.on("disconnect", (reason) => {
        console.log(`[Socket.IO] Disconnected: ${socket.id} | Reason: ${reason}`);

        const deviceId = socket.deviceId;
        if (!deviceId) return;

        const device = devices.get(deviceId);
        if (device && device.socketId === socket.id) {
        devices.set(deviceId, {
            ...device,
            connected: false,
            disconnectedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        });

        io.emit("deviceStatus", {
            deviceId,
            connected: false,
            lastSeen: new Date().toISOString(),
            reason
        });

        console.log(`[Device] ${deviceId} DISCONNECTED`);
        }
    });
    });

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, "0.0.0.0", () => {
    console.log(`SiloSense Socket Server running on port ${PORT}`);
    });