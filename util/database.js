const { Sequelize, DataTypes, Op } = require("sequelize");
const config = require("./config");

const sequelize = new Sequelize(config.dbName, config.dbUser, config.dbPassword, {
  host: config.dbHost,
  port: config.dbPort,
  dialect: config.dbDialect,
  logging: config.dbLogging ? console.log : false,
  define: {
    underscored: true,
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

const Room = sequelize.define(
  "Room",
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "",
    },
    isPrivate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    ownerId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    tableName: "rooms",
    indexes: [
      { fields: ["owner_id"] },
      { fields: ["is_private"] },
    ],
  },
);

const RoomMember = sequelize.define(
  "RoomMember",
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    userId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("owner", "member"),
      allowNull: false,
      defaultValue: "member",
    },
  },
  {
    tableName: "room_members",
    indexes: [
      { unique: true, fields: ["room_id", "user_id"] },
      { fields: ["user_id"] },
    ],
  },
);

const Message = sequelize.define(
  "Message",
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
    },
    roomId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    senderId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    senderName: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    senderEmail: {
      type: DataTypes.STRING(180),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("text"),
      allowNull: false,
      defaultValue: "text",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    clientMessageId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: "messages",
    indexes: [
      { fields: ["room_id", "created_at"] },
      { fields: ["sender_id"] },
      { fields: ["client_message_id"] },
    ],
  },
);

Room.hasMany(RoomMember, {
  as: "members",
  foreignKey: "roomId",
  sourceKey: "id",
  onDelete: "CASCADE",
});
RoomMember.belongsTo(Room, {
  as: "room",
  foreignKey: "roomId",
  targetKey: "id",
});

Room.hasMany(Message, {
  as: "messages",
  foreignKey: "roomId",
  sourceKey: "id",
  onDelete: "CASCADE",
});
Message.belongsTo(Room, {
  as: "room",
  foreignKey: "roomId",
  targetKey: "id",
});

async function ensureGeneralRoom() {
  const now = new Date();

  await Room.findOrCreate({
    where: { id: "general" },
    defaults: {
      id: "general",
      name: "General",
      description: "Default public group chat room.",
      isPrivate: false,
      ownerId: "system",
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function initializeDatabase() {
  await sequelize.authenticate();

  if (config.dbSync) {
    await sequelize.sync();
  }

  await ensureGeneralRoom();
  console.log(`[database] connected to ${config.dbDialect}://${config.dbHost}:${config.dbPort}/${config.dbName}`);
}

module.exports = {
  sequelize,
  Sequelize,
  DataTypes,
  Op,
  Room,
  RoomMember,
  Message,
  initializeDatabase,
};
