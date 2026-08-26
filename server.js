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
  process.env.FRONTEND_URL || "https://sih-26-cyan.vercel.app";

const normalizedFrontendUrl = FRONTEND_URL.replace(/\/$/, "");

const allowedOrigins = [
  normalizedFrontendUrl,
  "https://sih-26-cyan.vercel.app",
  "https://sih-26-beta.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5000",
];

// Remove duplicates
const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

// =====================================================
// EXPRESS MIDDLEWARE
// =====================================================

app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      // ESP32 / Postman / server-to-server
      if (!origin) {
        console.log("[CORS] Request without Origin header");
        return callback(null, true);
      }

      if (uniqueAllowedOrigins.includes(origin)) {
        console.log(`[CORS] Allowed origin: ${origin}`);
        return callback(null, true);
      }

      console.warn(`[CORS] Unknown origin: ${origin}`);

      // Keep open for debugging.
      return callback(null, true);
    },

    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

// =====================================================
// HTTP REQUEST LOGGER
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

  // Important for Render/cloud proxy
  pingInterval: 25000,
  pingTimeout: 20000,

  // Allow both browser and ESP32
  transports: ["websocket", "polling"],

  connectTimeout: 45000,

  // Allow clients to reconnect
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

    console.error(
      "Origin:",
      err.req.headers?.origin || "NO_ORIGIN"
    );

    console.error(
      "User-Agent:",
      err.req.headers?.["user-agent"] || "NO_USER_AGENT"
    );

    console.error(
      "Remote Address:",
      err.req.socket?.remoteAddress || "UNKNOWN"
    );
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
  const origin =
    socket.handshake.headers?.origin || "NO_ORIGIN";

  const userAgent =
    socket.handshake.headers?.["user-agent"] ||
    "NO_USER_AGENT";

  let clientType = "UNKNOWN";

  if (
    origin === "https://sih-26-cyan.vercel.app"
  ) {
    clientType = "VERCEL_FRONTEND";
  } else if (
    origin === "https://sih-26-beta.vercel.app"
  ) {
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
// CONNECTION STATUS
// =====================================================

function printConnectionStatus() {
  const sockets = Array.from(
    io.sockets.sockets.values()
  );

  const totalConnections = sockets.length;

  const esp32Connections = sockets.filter(
    (socket) => !!socket.deviceId
  ).length;

  const frontendConnections = sockets.filter(
    (socket) => {
      const origin =
        socket.handshake.headers?.origin;

      return (
        origin ===
          "https://sih-26-cyan.vercel.app" ||
        origin ===
          "https://sih-26-beta.vercel.app"
      );
    }
  ).length;

  const connectedDevices = Array.from(
    devices.values()
  ).filter(
    (device) => device.connected === true
  );

  console.log("");
  console.log("==================================================");
  console.log("📊 SILOSENSE CONNECTION STATUS");
  console.log("==================================================");

  console.log(
    "Total Socket Connections :",
    totalConnections
  );

  console.log(
    "ESP32 Connections        :",
    esp32Connections
  );

  console.log(
    "Frontend Connections     :",
    frontendConnections
  );

  console.log(
    "Registered Devices       :",
    devices.size
  );

  console.log(
    "Connected Devices        :",
    connectedDevices.length
  );

  // ---------------------------------------------------
  // Socket status
  // ---------------------------------------------------

  if (totalConnections === 0) {
    console.log("⚠️ NO SOCKET CLIENTS CONNECTED");
  } else {
    console.log("🟢 SOCKET CLIENT(S) CONNECTED");
  }

  // ---------------------------------------------------
  // ESP32 status
  // ---------------------------------------------------

  if (esp32Connections === 0) {
    console.log("🔴 NO ESP32 DEVICE CONNECTED");
  } else {
    console.log(
      `🟢 ${esp32Connections} ESP32 DEVICE(S) CONNECTED`
    );
  }

  // ---------------------------------------------------
  // Frontend status
  // ---------------------------------------------------

  if (frontendConnections === 0) {
    console.log("⚪ NO VERCEL FRONTEND CONNECTED");
  } else {
    console.log(
      `🟢 ${frontendConnections} FRONTEND CLIENT(S) CONNECTED`
    );
  }

  // ---------------------------------------------------
  // Registered devices
  // ---------------------------------------------------

  if (devices.size === 0) {
    console.log("");
    console.log("📋 REGISTERED DEVICES: NONE");
  } else {
    console.log("");
    console.log("📋 REGISTERED DEVICES:");

    for (const device of devices.values()) {
      console.log(
        `   ${
          device.connected ? "🟢" : "🔴"
        } ${device.deviceId} | ` +
          `Connected: ${device.connected} | ` +
          `Last Seen: ${device.lastSeen} | ` +
          `Socket: ${device.socketId || "NONE"}`
      );
    }
  }

  console.log("");
  console.log(
    "🕒 Time:",
    new Date().toISOString()
  );

  console.log("==================================================");
  console.log("");
}

// =====================================================
// STATUS MONITOR
// =====================================================

// Print every 10 seconds.
// This happens even when NOTHING is connected.

setInterval(() => {
  printConnectionStatus();
}, 10000);

// =====================================================
// SERVER HEALTH
// =====================================================

app.get("/", (req, res) => {
  const connectedDevices = Array.from(
    devices.values()
  ).filter(
    (device) => device.connected === true
  ).length;

  const activeSocketConnections =
    io.sockets.sockets.size;

  res.status(200).json({
    success: true,

    service: "SiloSense Socket Server",

    status: "running",

    connectedDevices,

    totalRegisteredDevices: devices.size,

    activeSocketConnections,

    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// SOCKET.IO HEALTH ENDPOINT
// =====================================================

app.get("/socket-health", (req, res) => {
  const sockets = Array.from(
    io.sockets.sockets.values()
  );

  res.status(200).json({
    success: true,

    socketServer: "online",

    totalConnections: sockets.length,

    esp32Connections: sockets.filter(
      (socket) => !!socket.deviceId
    ).length,

    frontendConnections: sockets.filter(
      (socket) => {
        const origin =
          socket.handshake.headers?.origin;

        return (
          origin ===
            "https://sih-26-cyan.vercel.app" ||
          origin ===
            "https://sih-26-beta.vercel.app"
        );
      }
    ).length,

    registeredDevices: devices.size,

    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// INTERNAL SENSOR SAVED
// =====================================================

app.post(
  "/internal/sensor-saved",
  (req, res) => {
    console.log("");
    console.log(
      "[HTTP] POST /internal/sensor-saved"
    );

    const data = req.body;

    if (!data) {
      console.error(
        "[HTTP] ❌ Missing request body"
      );

      return res.status(400).json({
        success: false,
        message: "Invalid payload",
      });
    }

    console.log(
      "📡 Broadcasting sensor:saved"
    );

    io.emit("sensor:saved", data);

    return res.status(200).json({
      success: true,
      message:
        "Sensor event emitted successfully",
    });
  }
);

// =====================================================
// SOCKET.IO CONNECTION
// =====================================================

io.on("connection", (socket) => {
  const clientInfo =
    identifyClient(socket);

  const transport =
    socket.conn.transport.name;

  console.log("");
  console.log("==================================================");
  console.log("🟢 SOCKET.IO CLIENT CONNECTED");
  console.log("==================================================");

  console.log(
    "Socket ID:",
    socket.id
  );

  console.log(
    "Client:",
    clientInfo.clientType
  );

  console.log(
    "Origin:",
    clientInfo.origin
  );

  console.log(
    "User-Agent:",
    clientInfo.userAgent
  );

  console.log(
    "IP:",
    socket.handshake.address
  );

  console.log(
    "Transport:",
    transport
  );

  console.log(
    "Time:",
    new Date().toISOString()
  );

  console.log("==================================================");
  console.log("");

  // Print status immediately
  printConnectionStatus();

  // ===================================================
  // TRANSPORT UPGRADE
  // ===================================================

  socket.conn.on(
    "upgrade",
    (transport) => {
      console.log(
        `⚡ Transport upgraded: ${socket.id} -> ${transport.name}`
      );
    }
  );

  // ===================================================
  // DEVICE CONNECTED
  // ===================================================

  socket.on(
    "deviceConnected",
    (data) => {
      console.log("");
      console.log(
        "--------------------------------------------------"
      );

      console.log(
        "📡 EVENT: deviceConnected"
      );

      console.log(
        "--------------------------------------------------"
      );

      console.log(
        "Socket:",
        socket.id
      );

      console.log(
        "Data:",
        data
      );

      let parsedData = data;

      // -----------------------------------------------
      // Parse JSON string
      // -----------------------------------------------

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

      // -----------------------------------------------
      // Validate device
      // -----------------------------------------------

      if (
        !parsedData ||
        !parsedData.deviceId
      ) {
        console.warn(
          "⚠️ deviceConnected missing deviceId"
        );

        return;
      }

      const deviceId =
        parsedData.deviceId;

      // Bind socket
      socket.deviceId = deviceId;

      const now =
        new Date().toISOString();

      // Save device
      devices.set(deviceId, {
        deviceId,

        socketId: socket.id,

        connected: true,

        clientType:
          clientInfo.clientType,

        connectedAt:
          now,

        lastSeen:
          now,
      });

      console.log("");
      console.log(
        `🟢 ESP32 ONLINE: ${deviceId}`
      );

      console.log(
        `🔌 Socket: ${socket.id}`
      );

      console.log(
        `📊 Registered devices: ${devices.size}`
      );

      // Notify frontend
      io.emit(
        "deviceStatus",
        {
          deviceId,

          connected: true,

          lastSeen: now,
        }
      );

      printConnectionStatus();
    }
  );

  // ===================================================
  // SENSOR DATA
  // ===================================================

  socket.on(
    "sensorData",
    (data) => {
      console.log("");
      console.log(
        "--------------------------------------------------"
      );

      console.log(
        "📊 EVENT: sensorData"
      );

      console.log(
        "--------------------------------------------------"
      );

      let parsedData = data;

      // -----------------------------------------------
      // Parse JSON
      // -----------------------------------------------

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

      // -----------------------------------------------
      // Validate
      // -----------------------------------------------

      if (
        !parsedData ||
        !parsedData.deviceId
      ) {
        console.warn(
          "⚠️ Invalid sensor payload"
        );

        console.warn(data);

        return;
      }

      const deviceId =
        parsedData.deviceId;

      const now =
        new Date().toISOString();

      // -----------------------------------------------
      // Update device
      // -----------------------------------------------

      const existingDevice =
        devices.get(deviceId);

      devices.set(deviceId, {
        ...(existingDevice || {}),

        deviceId,

        socketId:
          socket.id,

        connected: true,

        clientType:
          clientInfo.clientType,

        connectedAt:
          existingDevice?.connectedAt ||
          now,

        lastSeen:
          now,
      });

      // -----------------------------------------------
      // Print telemetry
      // -----------------------------------------------

      console.log(
        `📡 Telemetry from: ${deviceId}`
      );

      console.log(
        "Temperature:",
        parsedData.telemetry?.temperature
      );

      console.log(
        "Humidity:",
        parsedData.telemetry?.humidity
      );

      console.log(
        "Gas:",
        parsedData.telemetry?.gas_raw
      );

      console.log(
        "CO2:",
        parsedData.telemetry?.co2_sim
      );

      console.log(
        "Motion:",
        parsedData.triggers?.motion_detected
      );

      console.log(
        "Sound:",
        parsedData.triggers?.sound_detected
      );

      console.log(
        "Alcohol:",
        parsedData.triggers?.alcohol_detected
      );

      console.log(
        "Tamper:",
        parsedData.triggers?.tamper_light
      );

      console.log(
        "Socket Connected:",
        socket.connected
      );

      console.log(
        "Time:",
        now
      );

      // -----------------------------------------------
      // Broadcast
      // -----------------------------------------------

      io.emit(
        "sensorData",
        parsedData
      );
    }
  );

  // ===================================================
  // GET DEVICES
  // ===================================================

  socket.on(
    "getDevices",
    () => {
      console.log("");
      console.log(
        "📋 EVENT: getDevices"
      );

      const deviceList =
        Array.from(
          devices.values()
        );

      socket.emit(
        "deviceList",
        deviceList
      );

      console.log(
        `📋 Sent ${deviceList.length} devices`
      );
    }
  );

  // ===================================================
  // SOCKET ERROR
  // ===================================================

  socket.on(
    "error",
    (error) => {
      console.error("");
      console.error(
        "=================================================="
      );

      console.error(
        "🔴 SOCKET ERROR"
      );

      console.error(
        "=================================================="
      );

      console.error(
        "Socket:",
        socket.id
      );

      console.error(
        "Client:",
        clientInfo.clientType
      );

      console.error(
        "Origin:",
        clientInfo.origin
      );

      console.error(
        "Error:",
        error
      );

      console.error(
        "=================================================="
      );
    }
  );

  // ===================================================
  // DISCONNECT
  // ===================================================

  socket.on(
    "disconnect",
    (reason, details) => {
      console.log("");
      console.log(
        "=================================================="
      );

      console.log(
        "🔴 SOCKET.IO CLIENT DISCONNECTED"
      );

      console.log(
        "=================================================="
      );

      console.log(
        "Socket ID:",
        socket.id
      );

      console.log(
        "Client:",
        clientInfo.clientType
      );

      console.log(
        "Origin:",
        clientInfo.origin
      );

      console.log(
        "Reason:",
        reason
      );

      console.log(
        "Details:",
        details || "NONE"
      );

      console.log(
        "Time:",
        new Date().toISOString()
      );

      console.log(
        "=================================================="
      );

      // -----------------------------------------------
      // Find device
      // -----------------------------------------------

      const deviceId =
        socket.deviceId;

      // No device registered on this socket
      if (!deviceId) {
        console.log(
          `🖥️ Frontend/Unknown client disconnected: ${clientInfo.clientType}`
        );

        printConnectionStatus();

        return;
      }

      const device =
        devices.get(deviceId);

      // -----------------------------------------------
      // Make sure old socket doesn't
      // overwrite a newer connection
      // -----------------------------------------------

      if (
        device &&
        device.socketId === socket.id
      ) {
        const now =
          new Date().toISOString();

        devices.set(
          deviceId,
          {
            ...device,

            connected: false,

            disconnectedAt:
              now,

            lastSeen:
              now,
          }
        );

        console.log(
          `🔴 ESP32 OFFLINE: ${deviceId}`
        );

        console.log(
          `Reason: ${reason}`
        );

        // Notify frontend
        io.emit(
          "deviceStatus",
          {
            deviceId,

            connected: false,

            lastSeen: now,

            reason,
          }
        );
      }

      printConnectionStatus();
    }
  );
});

// =====================================================
// SERVER START
// =====================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "=================================================="
    );

    console.log(
      "🚀 SILOSENSE SOCKET SERVER STARTED"
    );

    console.log(
      "=================================================="
    );

    console.log(
      "Port:",
      PORT
    );

    console.log(
      "Frontend:",
      normalizedFrontendUrl
    );

    console.log(
      "Allowed Origins:",
      uniqueAllowedOrigins
    );

    console.log(
      "Socket.IO Path:",
      "/socket.io/"
    );

    console.log(
      "Transports:",
      ["websocket", "polling"]
    );

    console.log(
      "Started:",
      new Date().toISOString()
    );

    console.log(
      "=================================================="
    );

    console.log(
      "📡 Waiting for ESP32 / frontend clients..."
    );

    console.log(
      "=================================================="
    );

    // IMPORTANT:
    // This prints even when there are ZERO devices.
    printConnectionStatus();
  }
);

// =====================================================
// PROCESS ERROR HANDLERS
// =====================================================

process.on(
  "uncaughtException",
  (error) => {
    console.error("");
    console.error(
      "💥 UNCAUGHT EXCEPTION"
    );
    console.error(error);
  }
);

process.on(
  "unhandledRejection",
  (reason) => {
    console.error("");
    console.error(
      "💥 UNHANDLED PROMISE REJECTION"
    );
    console.error(reason);
  }
);