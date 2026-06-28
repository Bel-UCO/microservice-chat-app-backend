const mqtt = require("mqtt");
const config = require("./config");

let client = null;
let connected = false;

function connectMqtt() {
  if (client) return client;

  client = mqtt.connect(config.mqttUrl, {
    clientId: `${config.mqttClientIdPrefix}-${process.pid}-${Date.now()}`,
    username: config.mqttUsername || undefined,
    password: config.mqttPassword || undefined,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
  });

  client.on("connect", function () {
    connected = true;
    console.log(`[mqtt] connected to ${config.mqttUrl}`);
  });

  client.on("reconnect", function () {
    console.log("[mqtt] reconnecting...");
  });

  client.on("close", function () {
    connected = false;
    console.log("[mqtt] connection closed");
  });

  client.on("error", function (error) {
    connected = false;
    console.error("[mqtt] error:", error.message);
  });

  return client;
}

function topicForRoom(roomId) {
  return `chat/rooms/${roomId}/messages`;
}

function publishRoomMessage(roomId, message) {
  const mqttClient = connectMqtt();
  const topic = topicForRoom(roomId);
  const payload = JSON.stringify({
    event: "message.created",
    roomId,
    data: message,
  });

  mqttClient.publish(topic, payload, { qos: 1, retain: false }, function (error) {
    if (error) {
      console.error(`[mqtt] failed to publish to ${topic}:`, error.message);
    }
  });
}

function publishRoomEvent(roomId, event, data) {
  const mqttClient = connectMqtt();
  const topic = `chat/rooms/${roomId}/events`;
  const payload = JSON.stringify({ event, roomId, data });

  mqttClient.publish(topic, payload, { qos: 1, retain: false }, function (error) {
    if (error) {
      console.error(`[mqtt] failed to publish to ${topic}:`, error.message);
    }
  });
}

function mqttStatus() {
  return {
    url: config.mqttUrl,
    connected,
  };
}

module.exports = {
  connectMqtt,
  publishRoomMessage,
  publishRoomEvent,
  mqttStatus,
  topicForRoom,
};
