const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// =====================================================
// ENVIRONMENT CONFIGURATION
// =====================================================

const PORT = process.env.PORT || 4000;

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://sih-26-cyan.vercel.app";

const normalizedFrontendUrl =
  FRONTEND_URL.replace(/\/$/, "");

const allowedOrigins = [
  normalizedFrontendUrl,
  "https://sih-26-cyan.vercel.app",
  "https://sih-26-beta.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
];

const uniqueAllowedOrigins = [
  ...new Set(allowedOrigins),
];

// =====================================================
// DEVICE CONFIGURATION
// =====================================================

// ESP32 sends sensorData every 5 seconds.
// If we don't receive anything for 25 seconds, consider device OFFLINE.
const DEVICE_TIMEOUT = 25 * 1000;

// =====================================================
// EXPRESS CONFIGURATION
// =====================================================

app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (uniqueAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(
        `[CORS] Blocked origin: ${origin}`
      );

      return callback(
        new Error("Not allowed by CORS")
      );
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

// =====================================================
// HTTP LOGGER
// =====================================================

app.use((req, res, next) => {
  console.log(
    `[HTTP] ${new Date().toISOString()} | ${req.method} ${req.url} | IP: ${req.ip}`
  );

  next();
});

// =====================================================
// DEVICE STORAGE
// =====================================================

const devices = new Map();

// =====================================================
// SOCKET.IO SERVER
// =====================================================

const io = new Server(server, {
  cors: {
    origin: uniqueAllowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  transports: [
    "websocket",
    "polling",
  ],
  connectTimeout: 45000,
  allowEIO3: false,
});

// =====================================================
// ENGINE.IO CONNECTION ERROR
// =====================================================

io.engine.on("connection_error", (err) => {
  console.error("");
  console.error("==================================================");
  console.error("❌ ENGINE.IO CONNECTION ERROR");
  console.error("==================================================");
  console.error("Code:", err.code);
  console.error("Message:", err.message);
  console.error("Context:", err.context);

  if (err.req) {
    console.error("URL:", err.req.url);
    console.error("Origin:", err.req.headers?.origin || "NO_ORIGIN");
    console.error("User-Agent:", err.req.headers?.["user-agent"] || "NO_USER_AGENT");
    console.error("Remote Address:", err.req.socket?.remoteAddress || "UNKNOWN");
  }

  console.error("==================================================");
  console.error("");
});

// =====================================================
// ENGINE.IO CONNECTION
// =====================================================

io.engine.on("connection", (engineSocket) => {
  console.log("");
  console.log("--------------------------------------------------");
  console.log("🔌 ENGINE.IO CONNECTION");
  console.log("--------------------------------------------------");
  console.log("Engine Socket ID:", engineSocket.id);
  console.log("Transport:", engineSocket.transport.name);
  console.log("Time:", new Date().toISOString());
  console.log("--------------------------------------------------");
});

// =====================================================
// CLIENT IDENTIFICATION
// =====================================================

function identifyClient(socket) {
  const origin = socket.handshake.headers?.origin || "NO_ORIGIN";
  const userAgent = socket.handshake.headers?.["user-agent"] || "NO_USER_AGENT";

  let clientType = "UNKNOWN";

  if (origin === "https://sih-26-cyan.vercel.app") {
    clientType = "VERCEL_FRONTEND";
  } else if (origin === "https://sih-26-beta.vercel.app") {
    clientType = "VERCEL_BETA";
  } else if (origin === "NO_ORIGIN") {
    clientType = "ESP32_OR_NON_BROWSER";
  }

  return {
    clientType,
    origin,
    userAgent,
  };
}

// =====================================================
// GET CURRENT DEVICE LIST
// =====================================================

function getDeviceList() {
  const now = Date.now();

  return Array.from(devices.values()).map((device) => {
    const lastSeenTime = new Date(device.lastSeen).getTime();
    const elapsed = now - lastSeenTime;
    const connected = device.connected && elapsed <= DEVICE_TIMEOUT;

    return {
      ...device,
      connected,
      elapsedSeconds: Math.max(0, Math.floor(elapsed / 1000)),
    };
  });
}

// =====================================================
// PRINT CONNECTION STATUS
// =====================================================

function printConnectionStatus() {
  const sockets = Array.from(io.sockets.sockets.values());
  const totalConnections = sockets.length;

  const esp32Connections = sockets.filter(
    (socket) => !!socket.deviceId
  ).length;

  const frontendConnections = sockets.filter((socket) => {
    const origin = socket.handshake.headers?.origin;
    return (
      origin === "https://sih-26-cyan.vercel.app" ||
      origin === "https://sih-26-beta.vercel.app"
    );
  }).length;

  const connectedDevices = getDeviceList().filter(
    (device) => device.connected === true
  );

  console.log("");
  console.log("==================================================");
  console.log("📊 SILOSENSE CONNECTION STATUS");
  console.log("==================================================");
  console.log("Total Socket Connections :", totalConnections);
  console.log("ESP32 Connections         :", esp32Connections);
  console.log("Frontend Connections     :", frontendConnections);
  console.log("Registered Devices       :", devices.size);
  console.log("Connected Devices        :", connectedDevices.length);

  if (totalConnections === 0) {
    console.log("⚠️ NO SOCKET CLIENTS CONNECTED");
  } else {
    console.log("🟢 SOCKET CLIENT(S) CONNECTED");
  }

  if (esp32Connections === 0) {
    console.log("🔴 NO ESP32 DEVICE CONNECTED");
  } else {
    console.log(`🟢 ${esp32Connections} ESP32 DEVICE(S) CONNECTED`);
  }

  if (frontendConnections === 0) {
    console.log("⚪ NO VERCEL FRONTEND CONNECTED");
  } else {
    console.log(`🟢 ${frontendConnections} FRONTEND CLIENT(S) CONNECTED`);
  }

  if (devices.size === 0) {
    console.log("");
    console.log("📋 REGISTERED DEVICES: NONE");
  } else {
    console.log("");
    console.log("📋 REGISTERED DEVICES:");

    for (const device of getDeviceList()) {
      console.log(
        `${device.connected ? "🟢" : "🔴"} ` +
        `${device.deviceId} | ` +
        `Connected: ${device.connected} | ` +
        `Last Seen: ${device.lastSeen} | ` +
        `Socket: ${device.socketId || "NONE"}`
      );
    }
  }

  console.log("");
  console.log("🕒 Time:", new Date().toISOString());
  console.log("==================================================");
  console.log("");
}

// =====================================================
// STATUS MONITOR
// =====================================================

setInterval(() => {
  printConnectionStatus();
}, 10000);

// =====================================================
// DEVICE TIMEOUT MONITOR
// =====================================================

setInterval(() => {
  const now = Date.now();

  for (const device of devices.values()) {
    if (!device.connected) {
      continue;
    }

    const lastSeenTime = new Date(device.lastSeen).getTime();
    const elapsed = now - lastSeenTime;

    if (elapsed > DEVICE_TIMEOUT) {
      console.log("");
      console.log("==================================================");
      console.log("🔴 DEVICE TIMEOUT");
      console.log("==================================================");
      console.log("Device:", device.deviceId);
      console.log("Last Seen:", device.lastSeen);
      console.log("Elapsed:", `${Math.round(elapsed / 1000)} seconds`);
      console.log("Timeout:", "25 seconds");
      console.log("==================================================");

      device.connected = false;
      device.disconnectedAt = new Date().toISOString();

      devices.set(device.deviceId, device);

      // Notify frontend instantly on device timeout
      io.emit("deviceStatus", {
        deviceId: device.deviceId,
        connected: false,
        lastSeen: device.lastSeen,
        reason: "timeout",
      });

      io.emit("deviceList", getDeviceList());
    }
  }
}, 5000);

// =====================================================
// SERVER HEALTH
// =====================================================

app.get("/", (req, res) => {
  const connectedDevices = getDeviceList().filter(
    (device) => device.connected === true
  ).length;

  res.status(200).json({
    success: true,
    service: "SiloSense Socket Server",
    status: "running",
    connectedDevices,
    totalRegisteredDevices: devices.size,
    activeSocketConnections: io.sockets.sockets.size,
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// SOCKET HEALTH
// =====================================================

app.get("/socket-health", (req, res) => {
  const sockets = Array.from(io.sockets.sockets.values());

  res.status(200).json({
    success: true,
    socketServer: "online",
    totalConnections: sockets.length,
    esp32Connections: sockets.filter((socket) => !!socket.deviceId).length,
    frontendConnections: sockets.filter((socket) => {
      const origin = socket.handshake.headers?.origin;
      return (
        origin === "https://sih-26-cyan.vercel.app" ||
        origin === "https://sih-26-beta.vercel.app"
      );
    }).length,
    registeredDevices: devices.size,
    devices: getDeviceList(),
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// INTERNAL SENSOR SAVED
// =====================================================

app.post("/internal/sensor-saved", (req, res) => {
  console.log("");
  console.log("[HTTP] POST /internal/sensor-saved");

  const data = req.body;

  if (!data) {
    return res.status(400).json({
      success: false,
      message: "Invalid payload",
    });
  }

  console.log("📡 Broadcasting sensor:saved");
  io.emit("sensor:saved", data);

  return res.status(200).json({
    success: true,
    message: "Sensor event emitted successfully",
  });
});

// =====================================================
// SOCKET.IO CONNECTION
// =====================================================

io.on("connection", (socket) => {
  const clientInfo = identifyClient(socket);

  console.log("");
  console.log("==================================================");
  console.log("🟢 SOCKET.IO CLIENT CONNECTED");
  console.log("==================================================");
  console.log("Socket ID:", socket.id);
  console.log("Client:", clientInfo.clientType);
  console.log("Origin:", clientInfo.origin);
  console.log("User-Agent:", clientInfo.userAgent);
  console.log("IP:", socket.handshake.address);
  console.log("Transport:", socket.conn.transport.name);
  console.log("Time:", new Date().toISOString());
  console.log("==================================================");

  // 🚀 INSTANT DASHBOARD SYNC ON INITIAL FRONTEND CONNECT
  socket.emit("deviceList", getDeviceList());

  // =================================================
  // TRANSPORT UPGRADE
  // =================================================

  socket.conn.on("upgrade", (transport) => {
    console.log(
      `⚡ Transport upgraded: ${socket.id} -> ${transport.name}`
    );
  });

  // =================================================
  // DEVICE CONNECTED (ESP32)
  // =================================================

  socket.on("deviceConnected", (data) => {
    console.log("");
    console.log("📡 EVENT: deviceConnected");

    let parsedData = data;

    if (typeof data === "string") {
      try {
        parsedData = JSON.parse(data);
      } catch (error) {
        console.error(
          "❌ JSON parse failed:",
          error.message
        );
        return;
      }
    }

    if (!parsedData || !parsedData.deviceId) {
      console.warn("⚠️ deviceConnected missing deviceId");
      return;
    }

    const deviceId = parsedData.deviceId;
    const now = new Date().toISOString();

    // Bind socket to device
    socket.deviceId = deviceId;

    const existingDevice = devices.get(deviceId);

    devices.set(deviceId, {
      ...(existingDevice || {}),
      deviceId,
      socketId: socket.id,
      connected: true,
      clientType: "ESP32",
      connectedAt: existingDevice?.connectedAt || now,
      lastSeen: now,
      disconnectedAt: null,
    });

    console.log(`🟢 ESP32 ONLINE: ${deviceId}`);
    console.log(`🔌 Socket: ${socket.id}`);

    // 🚀 INSTANT PUSH TO ALL DASHBOARDS
    io.emit("deviceStatus", {
      deviceId,
      connected: true,
      lastSeen: now,
      timestamp: now,
    });

    // 🚀 REFRESH FULL DEVICE LIST IN REAL-TIME
    io.emit("deviceList", getDeviceList());

    printConnectionStatus();
  });

  // =================================================
  // SENSOR DATA
  // =================================================

  socket.on("sensorData", (data) => {
    console.log("");
    console.log("📊 EVENT: sensorData");

    let parsedData = data;

    if (typeof data === "string") {
      try {
        parsedData = JSON.parse(data);
      } catch (error) {
        console.error(
          "❌ Sensor JSON parse error:",
          error.message
        );
        return;
      }
    }

    if (!parsedData || !parsedData.deviceId) {
      console.warn("⚠️ Invalid sensor payload");
      return;
    }

    const deviceId = parsedData.deviceId;

    const existingDevice = devices.get(deviceId);

    if (!existingDevice) {
      console.warn(
        `⚠️ Sensor data from unregistered device: ${deviceId}`
      );
      return;
    }

    if (existingDevice.socketId !== socket.id) {
      console.warn(
        `⚠️ Sensor data from old socket: ${deviceId}`
      );
      return;
    }

    const now = new Date().toISOString();

    // UPDATE DEVICE LAST SEEN
    devices.set(deviceId, {
      ...existingDevice,
      connected: true,
      lastSeen: now,
      socketId: socket.id,
      disconnectedAt: null,
    });

    console.log(`📡 Telemetry from: ${deviceId}`);

    // BROADCAST TO FRONTEND
    io.emit("sensorData", parsedData);
  });

  // =================================================
  // GET DEVICES
  // =================================================

  socket.on("getDevices", () => {
    console.log("📋 EVENT: getDevices");
    const deviceList = getDeviceList();
    socket.emit("deviceList", deviceList);
    console.log(`📋 Sent ${deviceList.length} devices`);
  });

  // =================================================
  // SOCKET ERROR
  // =================================================

  socket.on("error", (error) => {
    console.error("🔴 SOCKET ERROR:", error);
  });

  // =================================================
  // DISCONNECT
  // =================================================

  socket.on("disconnect", (reason, details) => {
    console.log("");
    console.log("==================================================");
    console.log("🔴 SOCKET.IO CLIENT DISCONNECTED");
    console.log("==================================================");
    console.log("Socket ID:", socket.id);
    console.log("Client:", clientInfo.clientType);
    console.log("Reason:", reason);
    console.log("Details:", details || "NONE");

    const deviceId = socket.deviceId;

    if (!deviceId) {
      console.log("🖥️ Frontend/unknown client disconnected");
      return;
    }

    const device = devices.get(deviceId);

    if (device && device.socketId === socket.id) {
      console.log(`🟡 ESP32 socket disconnected: ${deviceId}`);

      devices.set(deviceId, {
        ...device,
        connected: false,
        disconnectedAt: new Date().toISOString(),
      });

      // 🚀 INSTANT DISCONNECT NOTICE TO FRONTEND
      io.emit("deviceStatus", {
        deviceId,
        connected: false,
        lastSeen: device.lastSeen,
        reason,
      });

      // 🚀 UPDATE FULL LIST IMMEDIATELY
      io.emit("deviceList", getDeviceList());
    }

    printConnectionStatus();
  });
});

// =====================================================
// SERVER START
// =====================================================

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("==================================================");
  console.log("🚀 SILOSENSE SOCKET SERVER STARTED");
  console.log("==================================================");
  console.log("Port:", PORT);
  console.log("Frontend:", normalizedFrontendUrl);
  console.log("Started:", new Date().toISOString());
  console.log("==================================================");

  printConnectionStatus();
});

// =====================================================
// PROCESS ERROR HANDLERS
// =====================================================

process.on("uncaughtException", (error) => {
  console.error("💥 UNCAUGHT EXCEPTION", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("💥 UNHANDLED PROMISE REJECTION", reason);
});