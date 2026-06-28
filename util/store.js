const crypto = require("crypto");
const apiError = require("./apiError");
const { sequelize, Op, Room, RoomMember, Message } = require("./database");

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function assertRoomName(name) {
  const normalized = normalizeName(name);

  if (!normalized) {
    throw apiError(422, "Room name is required.");
  }

  if (normalized.length > 80) {
    throw apiError(422, "Room name must be 80 characters or less.");
  }

  return normalized;
}

function assertMessagePayload(payload) {
  const content = String(payload.content || "").trim();
  const type = payload.type || "text";

  if (!content) throw apiError(422, "Message content is required.");
  if (content.length > 2000) throw apiError(422, "Message content must be 2000 characters or less.");
  if (type !== "text") throw apiError(422, "Only text messages are supported for now.");

  return { content, type };
}

function plain(model) {
  if (!model) return null;
  if (typeof model.get === "function") return model.get({ plain: true });
  return model;
}

function memberIdsFromRoom(room) {
  const data = plain(room);
  const members = Array.isArray(data.members) ? data.members : [];
  return members.map((member) => member.userId);
}

function sanitizeRoom(room) {
  const data = plain(room);

  return {
    id: data.id,
    name: data.name,
    description: data.description || "",
    isPrivate: Boolean(data.isPrivate),
    ownerId: data.ownerId,
    memberIds: memberIdsFromRoom(data),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function sanitizeMember(member) {
  const data = plain(member);

  return {
    id: data.userId,
    role: data.role,
    createdAt: data.createdAt,
  };
}

function sanitizeMessage(message) {
  const data = plain(message);

  return {
    id: data.id,
    roomId: data.roomId,
    sender: {
      id: data.senderId,
      name: data.senderName,
      email: data.senderEmail || null,
    },
    type: data.type || "text",
    content: data.content,
    clientMessageId: data.clientMessageId || null,
    createdAt: data.createdAt,
  };
}

async function findRoom(roomId, options) {
  return Room.findByPk(roomId, {
    include: [{ model: RoomMember, as: "members" }],
    transaction: options && options.transaction,
  });
}

async function isRoomMember(room, userId) {
  const data = plain(room);
  if (!data) return false;
  if (!data.isPrivate) return true;
  if (data.ownerId === userId) return true;

  const members = Array.isArray(data.members) ? data.members : [];
  if (members.some((member) => member.userId === userId)) return true;

  const membership = await RoomMember.findOne({ where: { roomId: data.id, userId } });
  return Boolean(membership);
}

function canManageRoom(room, user) {
  const data = plain(room);
  return data.ownerId === user.id || user.roles.includes("admin");
}

async function requireRoomAccess(room, user) {
  if (!room) throw apiError(404, "Room was not found.");
  const allowed = await isRoomMember(room, user.id);
  if (!allowed) throw apiError(403, "You do not have access to this room.");
}

async function requireRoomManager(room, user) {
  await requireRoomAccess(room, user);
  if (!canManageRoom(room, user)) throw apiError(403, "Only the room owner or admin can manage this room.");
}

async function listRooms(user) {
  const rooms = await Room.findAll({
    include: [{ model: RoomMember, as: "members" }],
    order: [["createdAt", "ASC"]],
  });

  const visibleRooms = [];

  for (const room of rooms) {
    if (await isRoomMember(room, user.id)) {
      visibleRooms.push(sanitizeRoom(room));
    }
  }

  return visibleRooms;
}

async function getRoom(roomId, user) {
  const room = await findRoom(roomId);
  await requireRoomAccess(room, user);
  return sanitizeRoom(room);
}

async function createRoom(user, payload) {
  const name = assertRoomName(payload.name);
  const description = normalizeName(payload.description || "");
  const isPrivate = Boolean(payload.isPrivate);
  const rawMemberIds = Array.isArray(payload.memberIds) ? payload.memberIds.map(String) : [];
  const uniqueMemberIds = Array.from(new Set([user.id, ...rawMemberIds].filter(Boolean)));

  const room = await sequelize.transaction(async function (transaction) {
    const createdRoom = await Room.create(
      {
        id: makeId(),
        name,
        description,
        isPrivate,
        ownerId: user.id,
      },
      { transaction },
    );

    const members = uniqueMemberIds.map((memberId) => ({
      id: makeId(),
      roomId: createdRoom.id,
      userId: memberId,
      role: memberId === user.id ? "owner" : "member",
    }));

    await RoomMember.bulkCreate(members, { transaction, ignoreDuplicates: true });

    return findRoom(createdRoom.id, { transaction });
  });

  return sanitizeRoom(room);
}

async function updateRoom(roomId, user, payload) {
  const room = await findRoom(roomId);
  await requireRoomManager(room, user);

  const updates = {};
  if (payload.name !== undefined) updates.name = assertRoomName(payload.name);
  if (payload.description !== undefined) updates.description = normalizeName(payload.description || "");
  if (payload.isPrivate !== undefined) updates.isPrivate = Boolean(payload.isPrivate);

  if (Object.keys(updates).length > 0) {
    await Room.update(updates, { where: { id: roomId } });
  }

  const updatedRoom = await findRoom(roomId);
  return sanitizeRoom(updatedRoom);
}

async function deleteRoom(roomId, user) {
  const room = await findRoom(roomId);
  await requireRoomManager(room, user);

  if (room.id === "general") {
    throw apiError(422, "The default general room cannot be deleted.");
  }

  await sequelize.transaction(async function (transaction) {
    await Message.destroy({ where: { roomId }, transaction });
    await RoomMember.destroy({ where: { roomId }, transaction });
    await Room.destroy({ where: { id: roomId }, transaction });
  });
}

async function joinRoom(roomId, user) {
  const room = await findRoom(roomId);

  if (!room) throw apiError(404, "Room was not found.");
  if (room.isPrivate) throw apiError(403, "Private rooms require invitation from the owner.");

  await RoomMember.findOrCreate({
    where: { roomId, userId: user.id },
    defaults: {
      id: makeId(),
      roomId,
      userId: user.id,
      role: "member",
    },
  });

  const updatedRoom = await findRoom(roomId);
  return sanitizeRoom(updatedRoom);
}

async function leaveRoom(roomId, user) {
  const room = await findRoom(roomId);
  await requireRoomAccess(room, user);

  if (room.ownerId === user.id) {
    throw apiError(422, "Room owner cannot leave the room. Delete the room or transfer ownership first.");
  }

  await RoomMember.destroy({ where: { roomId, userId: user.id } });
  const updatedRoom = await findRoom(roomId);
  return sanitizeRoom(updatedRoom);
}

async function listMembers(roomId, user) {
  const room = await findRoom(roomId);
  await requireRoomAccess(room, user);

  const members = await RoomMember.findAll({
    where: { roomId },
    order: [
      ["role", "DESC"],
      ["createdAt", "ASC"],
    ],
  });

  return members.map(sanitizeMember);
}

async function addMember(roomId, user, memberId) {
  const room = await findRoom(roomId);
  await requireRoomManager(room, user);

  const normalizedMemberId = String(memberId || "").trim();
  if (!normalizedMemberId) throw apiError(422, "memberId is required.");

  await RoomMember.findOrCreate({
    where: { roomId, userId: normalizedMemberId },
    defaults: {
      id: makeId(),
      roomId,
      userId: normalizedMemberId,
      role: "member",
    },
  });

  const updatedRoom = await findRoom(roomId);
  return sanitizeRoom(updatedRoom);
}

async function removeMember(roomId, user, memberId) {
  const room = await findRoom(roomId);
  await requireRoomManager(room, user);

  const normalizedMemberId = String(memberId || "").trim();
  if (!normalizedMemberId) throw apiError(422, "memberId is required.");
  if (normalizedMemberId === room.ownerId) throw apiError(422, "Room owner cannot be removed.");

  await RoomMember.destroy({ where: { roomId, userId: normalizedMemberId } });
  const updatedRoom = await findRoom(roomId);
  return sanitizeRoom(updatedRoom);
}

async function listMessages(roomId, user, options) {
  const room = await findRoom(roomId);
  await requireRoomAccess(room, user);

  const limit = Math.min(Math.max(Number((options && options.limit) || 50), 1), 100);
  const where = { roomId };

  if (options && options.before) {
    const beforeDate = new Date(options.before);
    if (!Number.isNaN(beforeDate.getTime())) {
      where.createdAt = { [Op.lt]: beforeDate };
    }
  }

  const messages = await Message.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
  });

  return messages.reverse().map(sanitizeMessage);
}

async function createMessage(roomId, user, payload) {
  const room = await findRoom(roomId);
  await requireRoomAccess(room, user);

  const { content, type } = assertMessagePayload(payload);

  const message = await Message.create({
    id: makeId(),
    roomId,
    senderId: user.id,
    senderName: user.name,
    senderEmail: user.email,
    type,
    content,
    clientMessageId: payload.clientMessageId || null,
  });

  return sanitizeMessage(message);
}

async function deleteMessage(roomId, messageId, user) {
  const room = await findRoom(roomId);
  await requireRoomAccess(room, user);

  const message = await Message.findOne({ where: { id: messageId, roomId } });
  if (!message) throw apiError(404, "Message was not found.");

  if (message.senderId !== user.id && !canManageRoom(room, user)) {
    throw apiError(403, "You can only delete your own message unless you manage this room.");
  }

  await Message.destroy({ where: { id: messageId, roomId } });
}

module.exports = {
  listRooms,
  getRoom,
  createRoom,
  updateRoom,
  deleteRoom,
  joinRoom,
  leaveRoom,
  listMembers,
  addMember,
  removeMember,
  listMessages,
  createMessage,
  deleteMessage,
};
