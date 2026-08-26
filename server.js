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
  "http://localhost:5000",
];

// =====================================================
// EXPRESS MIDDLEWARE
// =====================================================

app.use(express.json());

app.use(
  cors({
    origin: (origin, callback) => {
      // ESP32 / Postman / server-to-server requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(
        `[CORS Warning] Origin not in whitelist: ${origin}`
      );

      // Currently allowing unmatched origins.
      // For strict CORS use:
      // return callback(new Error("Not allowed by CORS"));

      return callback(null, true);
    },

    methods: ["GET", "POST"],
    credentials: true,
  })
);

// =====================================================
// HTTP REQUEST LOGGER
// =====================================================

app.use((req, res, next) => {
  console.log(
    `[HTTP Request] ${new Date().toISOString()} | ${req.method} ${req.url} | IP: ${req.ip}`
  );

  next();
});

// =====================================================
// SOCKET.IO SERVER
// =====================================================

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },

  // Socket.IO heartbeat
  pingInterval: 25000,
  pingTimeout: 20000,

  // Allow both transports
  transports: ["websocket"],

  connectTimeout: 45000,
});

// =====================================================
// ENGINE.IO CONNECTION ERROR LOGGER
// =====================================================

io.engine.on("connection_error", (err) => {
  console.error("\n==============================================");
  console.error("❌ ENGINE.IO CONNECTION ERROR");
  console.error("==============================================");

  console.error("Code    :", err.code);
  console.error("Message :", err.message);
  console.error("Context :", err.context);

  if (err.req) {
    console.error("URL     :", err.req.url);

    console.error(
      "Origin  :",
      err.req.headers?.origin || "NO_ORIGIN"
    );

    console.error(
      "Agent   :",
      err.req.headers?.["user-agent"] || "NO_USER_AGENT"
    );
  }

  console.error("==============================================\n");
});

// =====================================================
// DEVICE TRACKING
// =====================================================

const devices = new Map();

// =====================================================
// HELPER: IDENTIFY CLIENT
// =====================================================

function identifyClient(socket) {
  const origin =
    socket.handshake.headers.origin || "NO_ORIGIN";

  const userAgent =
    socket.handshake.headers["user-agent"] ||
    "NO_USER_AGENT";

  let clientType = "UNKNOWN";

  if (
    origin ===
    "https://sih-26-cyan.vercel.app"
  ) {
    clientType = "VERCEL_FRONTEND";
  } else if (
    origin ===
    "https://sih-26-beta.vercel.app"
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
// CONNECTION STATUS MONITOR
// =====================================================

function printConnectionStatus() {
  const sockets = Array.from(
    io.sockets.sockets.values()
  );

  const totalConnections = sockets.length;

  // ESP32 devices are identified after deviceConnected
  const esp32Connections = sockets.filter(
    (socket) => socket.deviceId
  ).length;

  // Browser/frontend connections
  const frontendConnections = sockets.filter(
    (socket) => {
      const origin =
        socket.handshake.headers.origin;

      return (
        origin ===
          "https://sih-26-cyan.vercel.app" ||
        origin ===
          "https://sih-26-beta.vercel.app"
      );
    }
  ).length;

  console.log("\n==============================================");
  console.log("📊 SiloSense CONNECTION STATUS");
  console.log("==============================================");

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

  // -----------------------------------------------
  // Overall status
  // -----------------------------------------------

  if (totalConnections === 0) {
    console.log("⚠️ NO CLIENTS CONNECTED");
  } else {
    console.log(
      "🟢 SOCKET.IO CLIENT(S) CONNECTED"
    );
  }

  // -----------------------------------------------
  // ESP32 status
  // -----------------------------------------------

  if (esp32Connections === 0) {
    console.log(
      "⚠️ NO ESP32 DEVICE CONNECTED"
    );
  } else {
    console.log(
      `🟢 ${esp32Connections} ESP32 DEVICE(S) CONNECTED`
    );
  }

  // -----------------------------------------------
  // Frontend status
  // -----------------------------------------------

  if (frontendConnections === 0) {
    console.log(
      "⚠️ NO VERCEL FRONTEND CONNECTED"
    );
  } else {
    console.log(
      `🟢 ${frontendConnections} FRONTEND CLIENT(S) CONNECTED`
    );
  }

  // -----------------------------------------------
  // Registered device information
  // -----------------------------------------------

  console.log(
    "Registered Devices       :",
    devices.size
  );

  const registeredDevices = Array.from(
    devices.values()
  );

  if (registeredDevices.length > 0) {
    console.log("\n📋 REGISTERED DEVICES:");

    registeredDevices.forEach((device) => {
      console.log(
        `   ${device.connected ? "🟢" : "🔴"} ${device.deviceId} | Connected: ${device.connected} | Last Seen: ${device.lastSeen}`
      );
    });
  }

  console.log(
    "\nTime :",
    new Date().toISOString()
  );

  console.log(
    "==============================================\n"
  );
}

// =====================================================
// PRINT STATUS EVERY 10 SECONDS
// =====================================================

setInterval(() => {
  printConnectionStatus();
}, 10000);

// =====================================================
// SERVER HEALTH ENDPOINT
// =====================================================

app.get("/", (req, res) => {
  const connectedDevices =
    Array.from(devices.values()).filter(
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
// INTERNAL SENSOR SAVED ENDPOINT
// =====================================================

app.post(
  "/internal/sensor-saved",
  (req, res) => {
    console.log(
      "\n[HTTP Log] POST /internal/sensor-saved -> Event received"
    );

    const data = req.body;

    if (!data) {
      console.error(
        "[HTTP Error] Missing body payload!"
      );

      return res.status(400).json({
        success: false,
        message: "Invalid payload",
      });
    }

    console.log(
      "📡 [Broadcast] Emitting 'sensor:saved' to all clients"
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
// SOCKET.IO CONNECTION ENGINE
// =====================================================

io.on("connection", (socket) => {
  const transportName =
    socket.conn.transport.name;

  const clientInfo =
    identifyClient(socket);

  // ===================================================
  // CONNECTION LOG
  // ===================================================

  console.log(
    "\n=============================================="
  );

  console.log(
    "🟢 SOCKET.IO CLIENT CONNECTED"
  );

  console.log(
    "=============================================="
  );

  console.log(
    "Socket ID :",
    socket.id
  );

  console.log(
    "Client    :",
    clientInfo.clientType
  );

  console.log(
    "Origin    :",
    clientInfo.origin
  );

  console.log(
    "User-Agent:",
    clientInfo.userAgent
  );

  console.log(
    "IP        :",
    socket.handshake.address
  );

  console.log(
    "Transport :",
    transportName
  );

  console.log(
    "Time      :",
    new Date().toISOString()
  );

  console.log(
    "==============================================\n"
  );

  // Immediately print current status
  printConnectionStatus();

  // ===================================================
  // TRANSPORT UPGRADE
  // ===================================================

  socket.conn.on("upgrade", (transport) => {
    console.log(
      `⚡ [Transport Upgrade] Socket ${socket.id} -> ${transport.name}`
    );
  });

  // ===================================================
  // ESP32 DEVICE REGISTRATION
  // ===================================================

  socket.on(
    "deviceConnected",
    (data) => {
      console.log(
        "\n----------------------------------------------"
      );

      console.log(
        "📡 [EVENT] deviceConnected"
      );

      console.log(
        "----------------------------------------------"
      );

      console.log(
        "Socket :",
        socket.id
      );

      console.log(
        "Client :",
        clientInfo.clientType
      );

      console.log(
        "Data   :",
        data
      );

      let parsedData = data;

      // Parse JSON string if required
      if (typeof data === "string") {
        try {
          parsedData =
            JSON.parse(data);
        } catch (err) {
          console.error(
            "❌ JSON Parse Failed:",
            err.message
          );

          return;
        }
      }

      // Validate device ID
      if (
        !parsedData ||
        !parsedData.deviceId
      ) {
        console.warn(
          "⚠️ Invalid deviceConnected payload:",
          data
        );

        return;
      }

      const deviceId =
        parsedData.deviceId;

      // Bind device to socket
      socket.deviceId = deviceId;

      // Save device information
      devices.set(deviceId, {
        deviceId,

        socketId: socket.id,

        connected: true,

        clientType:
          clientInfo.clientType,

        connectedAt:
          new Date().toISOString(),

        lastSeen:
          new Date().toISOString(),
      });

      const activeDevices =
        Array.from(
          devices.values()
        ).filter(
          (device) =>
            device.connected === true
        ).length;

      console.log(
        `✅ [ESP32 ONLINE] Device ID: '${deviceId}'`
      );

      console.log(
        `📊 Active Devices: ${activeDevices}`
      );

      // Notify frontend
      io.emit(
        "deviceStatus",
        {
          deviceId,

          connected: true,

          lastSeen:
            new Date().toISOString(),
        }
      );

      // Print updated status
      printConnectionStatus();
    }
  );

  // ===================================================
  // ESP32 SENSOR TELEMETRY
  // ===================================================

  socket.on(
    "sensorData",
    (data) => {
      console.log(
        "\n----------------------------------------------"
      );

      console.log(
        "📊 [EVENT] sensorData"
      );

      console.log(
        "----------------------------------------------"
      );

      console.log(
        "Socket :",
        socket.id
      );

      console.log(
        "Client :",
        clientInfo.clientType
      );

      let parsedData = data;

      // Parse JSON string
      if (typeof data === "string") {
        try {
          parsedData =
            JSON.parse(data);
        } catch (err) {
          console.error(
            "❌ JSON Parse Error:",
            err.message
          );

          return;
        }
      }

      // Validate payload
      if (
        !parsedData ||
        !parsedData.deviceId
      ) {
        console.warn(
          "⚠️ Invalid sensor payload:",
          data
        );

        return;
      }

      const deviceId =
        parsedData.deviceId;

      // Bind device
      socket.deviceId =
        deviceId;

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

        lastSeen:
          new Date().toISOString(),
      });

      console.log(
        `📡 Telemetry received from ESP32: '${deviceId}'`
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

      // Broadcast telemetry to dashboard
      io.emit(
        "sensorData",
        parsedData
      );
    }
  );

  // ===================================================
  // FRONTEND: GET DEVICES
  // ===================================================

  socket.on(
    "getDevices",
    () => {
      console.log(
        "\n----------------------------------------------"
      );

      console.log(
        "🖥️ [EVENT] getDevices"
      );

      console.log(
        "----------------------------------------------"
      );

      console.log(
        "Socket :",
        socket.id
      );

      console.log(
        "Client :",
        clientInfo.clientType
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
        `📋 Sent ${deviceList.length} device entries`
      );
    }
  );

  // ===================================================
  // SOCKET ERROR
  // ===================================================

  socket.on(
    "error",
    (error) => {
      console.error(
        "\n=============================================="
      );

      console.error(
        "🔴 SOCKET ERROR"
      );

      console.error(
        "=============================================="
      );

      console.error(
        "Socket :",
        socket.id
      );

      console.error(
        "Client :",
        clientInfo.clientType
      );

      console.error(
        "Origin :",
        clientInfo.origin
      );

      console.error(
        "Error  :",
        error
      );

      console.error(
        "==============================================\n"
      );
    }
  );

  // ===================================================
  // DISCONNECT
  // ===================================================

  socket.on(
    "disconnect",
    (reason, details) => {
      console.log(
        "\n=============================================="
      );

      console.log(
        "🔴 SOCKET.IO CLIENT DISCONNECTED"
      );

      console.log(
        "=============================================="
      );

      console.log(
        "Socket ID :",
        socket.id
      );

      console.log(
        "Client    :",
        clientInfo.clientType
      );

      console.log(
        "Origin    :",
        clientInfo.origin
      );

      console.log(
        "Transport :",
        socket.conn.transport.name
      );

      console.log(
        "Reason    :",
        reason
      );

      console.log(
        "Details   :",
        details || "NONE"
      );

      console.log(
        "Time      :",
        new Date().toISOString()
      );

      console.log(
        "==============================================\n"
      );

      const deviceId =
        socket.deviceId;

      // No device ID means frontend/unknown client
      if (!deviceId) {
        console.log(
          `🖥️ [Frontend/Unknown Client Offline] ${clientInfo.clientType}`
        );

        printConnectionStatus();

        return;
      }

      // ESP32 disconnect
      const device =
        devices.get(deviceId);

      if (
        device &&
        device.socketId ===
          socket.id
      ) {
        devices.set(
          deviceId,
          {
            ...device,

            connected: false,

            disconnectedAt:
              new Date().toISOString(),

            lastSeen:
              new Date().toISOString(),
          }
        );

        console.log(
          `❌ [ESP32 OFFLINE] Device ID: '${deviceId}'`
        );

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
      }

      // Print updated status
      printConnectionStatus();
    }
  );
});

// =====================================================
// SERVER INITIALIZATION
// =====================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "=================================================="
    );

    console.log(
      "🚀 SiloSense Socket Engine Online!"
    );

    console.log(
      `🚀 Port: ${PORT}`
    );

    console.log(
      `🌐 Origins Allowed: ${JSON.stringify(
        allowedOrigins
      )}`
    );

    console.log(
      `🕒 Started At: ${new Date().toISOString()}`
    );

    console.log(
      "=================================================="
    );

    console.log(
      "📡 Socket.IO is READY and waiting for clients..."
    );

    // Print initial status immediately
    printConnectionStatus();
  }
);