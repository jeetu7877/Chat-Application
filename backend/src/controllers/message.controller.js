import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { sendPushNotification } from "../services/notification.service.js"; // 🆕 Import notification service
import bcrypt from "bcryptjs";

// ── FETCH USERS FOR SIDEBAR (Hides Locked Chats) ──────────────────────────
export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUser = await User.findById(loggedInUserId);
    const blockedUserIds = loggedInUser.blockedUsers || [];
    const lockedUserIds = loggedInUser.lockedChats || [];

    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId, $nin: [...blockedUserIds, ...lockedUserIds] },
    }).select("-password");

    const usersWithLastMessage = await Promise.all(
      filteredUsers.map(async (user) => {
        const lastMessage = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: user._id },
            { senderId: user._id, receiverId: loggedInUserId },
          ],
          deletedFor: { $ne: loggedInUserId },
        }).sort({ createdAt: -1 });

        const unreadCount = await Message.countDocuments({
          senderId: user._id,
          receiverId: loggedInUserId,
          isRead: false,
          deletedFor: { $ne: loggedInUserId },
        });

        // ✅ WhatsApp Sidebar Preview Formats
        let lastMsgText = "";
        if (lastMessage) {
          if (lastMessage.sharedContactId) lastMsgText = "👤 Contact";
          else if (lastMessage.text) lastMsgText = lastMessage.text;
          else if (lastMessage.image) lastMsgText = "📷 Photo";
          else if (lastMessage.audio) lastMsgText = "🎵 Audio Note";
          else if (lastMessage.documentFile) lastMsgText = `📄 ${lastMessage.fileName || "Document"}`;
          else if (lastMessage.locationUrl) lastMsgText = "📍 Location Shared";
          else if (lastMessage.file) lastMsgText = "📎 Attachment";
        }

        return {
          ...user.toObject(),
          lastMessage: lastMsgText,
          lastMessageTime: lastMessage?.createdAt || null,
          unreadCount,
        };
      })
    );

    const sorted = usersWithLastMessage
      .filter((u) => !!u.lastMessageTime)
      .sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

    res.status(200).json(sorted);
  } catch (error) {
    console.error("Error in getUsersForSidebar", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── SET CHAT LOCK PASSWORD ──────────────────────────────────────────────────
export const setLockPassword = async (req, res) => {
  try {
    const { password, oldPassword } = req.body;
    const userId = req.user._id;

    if (!password || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters long" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.isChatLockSet && user.chatLockPassword) {
      if (!oldPassword) {
        return res.status(400).json({ error: "Current password is required to change settings" });
      }
      const isMatch = await bcrypt.compare(oldPassword, user.chatLockPassword);
      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect current password. Verification failed." });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.chatLockPassword = hashedPassword;
    user.isChatLockSet = true;
    await user.save();

    res.status(200).json({ message: "Chat lock password configured successfully" });
  } catch (error) {
    console.error("Error in setLockPassword", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── VERIFY CHAT LOCK PASSWORD ───────────────────────────────────────────────
export const verifyLockPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user || !user.chatLockPassword) {
      return res.status(400).json({ error: "Chat lock password is not configured yet" });
    }

    const isMatch = await bcrypt.compare(password, user.chatLockPassword);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect password" });
    }

    res.status(200).json({ message: "Password verified successfully", verified: true });
  } catch (error) {
    console.error("Error in verifyLockPassword", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── TOGGLE LOCK CHAT (Lock/Unlock) ──────────────────────────────────────────
export const toggleLockChat = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: targetUserId } = req.params;

    const me = await User.findById(myId);
    const isAlreadyLocked = me.lockedChats?.includes(targetUserId);

    if (isAlreadyLocked) {
      await User.findByIdAndUpdate(myId, { $pull: { lockedChats: targetUserId } });
      return res.status(200).json({ message: "Chat unlocked successfully", locked: false });
    } else {
      await User.findByIdAndUpdate(myId, { $addToSet: { lockedChats: targetUserId } });
      return res.status(200).json({ message: "Chat locked and hidden", locked: true });
    }
  } catch (error) {
    console.error("Error in toggleLockChat", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── FETCH LOCKED USERS ONLY ──────────────────────────────────────────────────
export const getLockedUsers = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUser = await User.findById(loggedInUserId);
    const lockedUserIds = loggedInUser.lockedChats || [];

    const lockedUsers = await User.find({
      _id: { $in: lockedUserIds },
    }).select("-password");

    const usersWithLastMessage = await Promise.all(
      lockedUsers.map(async (user) => {
        const lastMessage = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: user._id },
            { senderId: user._id, receiverId: loggedInUserId },
          ],
          deletedFor: { $ne: loggedInUserId },
        }).sort({ createdAt: -1 });

        const unreadCount = await Message.countDocuments({
          senderId: user._id,
          receiverId: loggedInUserId,
          isRead: false,
          deletedFor: { $ne: loggedInUserId },
        });

        let lastMsgText = "";
        if (lastMessage) {
          if (lastMessage.sharedContactId) lastMsgText = "👤 Contact";
          else if (lastMessage.text) lastMsgText = lastMessage.text;
          else if (lastMessage.image) lastMsgText = "📷 Photo";
          else if (lastMessage.audio) lastMsgText = "🎵 Audio Note";
          else if (lastMessage.documentFile) lastMsgText = `📄 ${lastMessage.fileName || "Document"}`;
          else if (lastMessage.locationUrl) lastMsgText = "📍 Location Shared";
          else if (lastMessage.file) lastMsgText = "📎 Attachment";
        }

        return {
          ...user.toObject(),
          lastMessage: lastMsgText,
          lastMessageTime: lastMessage?.createdAt || null,
          unreadCount,
        };
      })
    );

    const sorted = usersWithLastMessage.sort(
      (a, b) => new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0)
    );

    res.status(200).json(sorted);
  } catch (error) {
    console.error("Error in getLockedUsers", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── GET MESSAGES ─────────────────────────────────────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
      deletedFor: { $ne: myId },
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ── SEND MESSAGE ─────────────────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { text, image, audio, file, fileName, fileType, documentFile, locationUrl, fileSize, mimeType, sharedContactId } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;
    const senderName = req.user.fullName; // Extracts sender metrics cleanly

    const receiver = await User.findById(receiverId);
    if (receiver?.blockedUsers?.includes(senderId.toString())) {
      return res.status(403).json({ error: "You cannot message this user" });
    }

    let imageUrl, audioUrl, docUrl;

    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    if (audio) {
      const uploadResponse = await cloudinary.uploader.upload(audio, {
        resource_type: "video", folder: "audio_messages",
      });
      audioUrl = uploadResponse.secure_url;
    }

    const targetDoc = documentFile || file;
    const currentMime = fileType || mimeType || "";

    if (targetDoc) {
      let ext = "pdf";
      if (fileName && fileName.includes(".")) {
        ext = fileName.split(".").pop().toLowerCase();
      }

      const uploadResponse = await cloudinary.uploader.upload(targetDoc, {
        resource_type: "raw",
        folder: "document_messages",
        format: ext,
      });
      docUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      audio: audioUrl,
      documentFile: docUrl,
      locationUrl: locationUrl || null,
      file: docUrl,
      fileName: fileName || "Document.pdf",
      fileType: currentMime || "application/pdf",
      fileSize: fileSize || "Attachment",
      sharedContactId: sharedContactId || null,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    let isUserViewingChat = false;

    if (receiverSocketId) {
      // Direct Web Socket Delivery Mechanism
      io.to(receiverSocketId).emit("newMessage", newMessage);

      // Verify if receiver node is actively active inside target client room bounds
      const clientRooms = io.sockets.adapter.rooms.get(String(senderId)); 
      if (clientRooms && clientRooms.has(receiverSocketId)) {
        isUserViewingChat = true;
      }
    }

    // 🆕 Trigger Firebase Push Notification fallback loop if node is completely offline/unfocused
    if (!isUserViewingChat) {
      await sendPushNotification({
        senderName,
        receiverId,
        message: newMessage,
        chatId: senderId, // maps room identifier parameters directly
      });
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── DELETE MESSAGE ────────────────────────────────────────────────────────────
export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (message.senderId.toString() !== req.user._id.toString())
      return res.status(401).json({ error: "Unauthorized" });

    await Message.findByIdAndDelete(id);

    const receiverSocketId = getReceiverSocketId(message.receiverId);
    if (receiverSocketId) io.to(receiverSocketId).emit("messageDeleted", id);

    res.status(200).json({ message: "Message deleted" });
  } catch (error) {
    console.log("Error in deleteMessage controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── EDIT MESSAGE ──────────────────────────────────────────────────────────────
export const editMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (message.senderId.toString() !== req.user._id.toString())
      return res.status(401).json({ error: "Unauthorized" });

    message.text = text;
    message.isEdited = true;
    await message.save();

    const receiverSocketId = getReceiverSocketId(message.receiverId);
    if (receiverSocketId) io.to(receiverSocketId).emit("messageEdited", message);

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in editMessage controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── MARK AS READ ──────────────────────────────────────────────────────────────
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const readReceiptsEnabled = req.query.receipts !== "false";

    await Message.updateMany(
      { senderId: id, receiverId: req.user._id, isRead: false },
      { isRead: true }
    );

    if (readReceiptsEnabled) {
      const senderSocketId = getReceiverSocketId(id);
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesRead", { readBy: req.user._id });
      }
    }

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.log("Error in markAsRead controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── ADD REACTION ──────────────────────────────────────────────────────────────
export const addReaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: "Message not found" });

    const existingIndex = message.reactions.findIndex(
      (r) => r.userId.toString() === userId.toString()
    );

    if (existingIndex !== -1) {
      if (message.reactions[existingIndex].emoji === emoji)
        message.reactions.splice(existingIndex, 1);
      else message.reactions[existingIndex].emoji = emoji;
    } else {
      message.reactions.push({ userId, emoji });
    }

    await message.save();

    const receiverSocketId = getReceiverSocketId(message.receiverId);
    const senderSocketId = getReceiverSocketId(message.senderId);
    if (receiverSocketId) io.to(receiverSocketId).emit("messageReaction", { messageId: id, reactions: message.reactions });
    if (senderSocketId) io.to(senderSocketId).emit("messageReaction", { messageId: id, reactions: message.reactions });

    res.status(200).json(message);
  } catch (error) {
    console.log("Error in addReaction controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── CLEAR CHAT ────────────────────────────────────────────────────────────────
export const clearChat = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: otherUserId } = req.params;

    await Message.updateMany(
      {
        $or: [
          { senderId: myId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: myId },
        ],
        deletedFor: { $ne: myId },
      },
      { $addToSet: { deletedFor: myId } }
    );

    res.status(200).json({ message: "Chat cleared successfully" });
  } catch (error) {
    console.log("Error in clearChat controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── BLOCK USER ────────────────────────────────────────────────────────────────
export const blockUser = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: targetUserId } = req.params;

    if (myId.toString() === targetUserId)
      return res.status(400).json({ error: "You cannot block yourself" });

    const me = await User.findById(myId);
    const isAlreadyBlocked = me.blockedUsers?.includes(targetUserId);

    if (isAlreadyBlocked) {
      await User.findByIdAndUpdate(myId, { $pull: { blockedUsers: targetUserId } });
      return res.status(200).json({ message: "User unblocked", blocked: false });
    } else {
      await User.findByIdAndUpdate(myId, { $addToSet: { blockedUsers: targetUserId } });
      return res.status(200).json({ message: "User blocked", blocked: true });
    }
  } catch (error) {
    console.log("Error in blockUser controller", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── GAME INVITE MODAL ENDPOINT ───────────────────────────────────────────────
export const getAllUsersForInvite = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUser = await User.findById(loggedInUserId);
    const blockedUserIds = loggedInUser?.blockedUsers || [];

    const allUsers = await User.find({
      _id: { $ne: loggedInUserId, $nin: blockedUserIds },
    }).select("-password");

    const completeUsersList = await Promise.all(
      allUsers.map(async (user) => {
        const lastMessage = await Message.findOne({
          $or: [
            { senderId: loggedInUserId, receiverId: user._id },
            { senderId: user._id, receiverId: loggedInUserId },
          ],
          deletedFor: { $ne: loggedInUserId },
        }).sort({ createdAt: -1 });

        let lastMsgText = "";
        if (lastMessage) {
          if (lastMessage.sharedContactId) lastMsgText = "👤 Contact";
          else if (lastMessage.text) lastMsgText = lastMessage.text;
          else if (lastMessage.image) lastMsgText = "📷 Photo";
        }

        return {
          ...user.toObject(),
          lastMessage: lastMsgText,
          lastMessageTime: lastMessage?.createdAt || null,
          unreadCount: 0,
        };
      })
    );

    res.status(200).json(completeUsersList);
  } catch (error) {
    console.error("Error in getAllUsersForInvite:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
