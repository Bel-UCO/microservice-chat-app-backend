const express = require("express");
const requireAuth = require("../util/authMiddleware");
const asyncHandler = require("../util/asyncHandler");
const store = require("../util/store");
const mqttClient = require("../util/mqttClient");

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async function (req, res) {
    res.json({ data: await store.listRooms(req.user) });
  }),
);

router.post(
  "/",
  asyncHandler(async function (req, res) {
    const room = await store.createRoom(req.user, req.body || {});
    mqttClient.publishRoomEvent(room.id, "room.created", room);
    res.status(201).json({ data: room });
  }),
);

router.get(
  "/:roomId",
  asyncHandler(async function (req, res) {
    res.json({ data: await store.getRoom(req.params.roomId, req.user) });
  }),
);

router.patch(
  "/:roomId",
  asyncHandler(async function (req, res) {
    const room = await store.updateRoom(req.params.roomId, req.user, req.body || {});
    mqttClient.publishRoomEvent(room.id, "room.updated", room);
    res.json({ data: room });
  }),
);

router.delete(
  "/:roomId",
  asyncHandler(async function (req, res) {
    await store.deleteRoom(req.params.roomId, req.user);
    mqttClient.publishRoomEvent(req.params.roomId, "room.deleted", { id: req.params.roomId });
    res.status(204).send();
  }),
);

router.post(
  "/:roomId/join",
  asyncHandler(async function (req, res) {
    const room = await store.joinRoom(req.params.roomId, req.user);
    mqttClient.publishRoomEvent(room.id, "member.joined", { userId: req.user.id, name: req.user.name });
    res.json({ data: room });
  }),
);

router.post(
  "/:roomId/leave",
  asyncHandler(async function (req, res) {
    const room = await store.leaveRoom(req.params.roomId, req.user);
    mqttClient.publishRoomEvent(room.id, "member.left", { userId: req.user.id, name: req.user.name });
    res.json({ data: room });
  }),
);

router.get(
  "/:roomId/members",
  asyncHandler(async function (req, res) {
    res.json({ data: await store.listMembers(req.params.roomId, req.user) });
  }),
);

router.post(
  "/:roomId/members",
  asyncHandler(async function (req, res) {
    const room = await store.addMember(req.params.roomId, req.user, req.body.memberId);
    mqttClient.publishRoomEvent(room.id, "member.added", { userId: req.body.memberId });
    res.status(201).json({ data: room });
  }),
);

router.delete(
  "/:roomId/members/:memberId",
  asyncHandler(async function (req, res) {
    const room = await store.removeMember(req.params.roomId, req.user, req.params.memberId);
    mqttClient.publishRoomEvent(room.id, "member.removed", { userId: req.params.memberId });
    res.json({ data: room });
  }),
);

router.get(
  "/:roomId/messages",
  asyncHandler(async function (req, res) {
    const messages = await store.listMessages(req.params.roomId, req.user, {
      limit: req.query.limit,
      before: req.query.before,
    });

    res.json({ data: messages });
  }),
);

router.post(
  "/:roomId/messages",
  asyncHandler(async function (req, res) {
    const message = await store.createMessage(req.params.roomId, req.user, req.body || {});
    mqttClient.publishRoomMessage(req.params.roomId, message);
    res.status(201).json({ data: message });
  }),
);

router.delete(
  "/:roomId/messages/:messageId",
  asyncHandler(async function (req, res) {
    await store.deleteMessage(req.params.roomId, req.params.messageId, req.user);
    mqttClient.publishRoomEvent(req.params.roomId, "message.deleted", { id: req.params.messageId });
    res.status(204).send();
  }),
);

module.exports = router;
