import Message from "../models/message.model.js";
import User from "../models/user.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import bcrypt from "bcryptjs"; // ✅ NAYA: Password hashing ke liye

// ── ✅ UPDATED: Fetch Users For Sidebar (Hides Locked Chats) ──────────────────
export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUser = await User.findById(loggedInUserId);
    const blockedUserIds = loggedInUser.blockedUsers || [];
    const lockedUserIds = loggedInUser.lockedChats || []; // ✅ NAYA: Locked list nikali

    // Filter kiye users: Na blocked hone chahiye, na locked hone chahiye normal list me
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

        return {
          ...user.toObject(),
          lastMessage: lastMessage?.text ||
            (lastMessage?.image ? "📷 Photo" :
            lastMessage?.audio ? "🎤 Voice message" :
            lastMessage?.file ? `📎 ${lastMessage?.fileName || "File"}` : ""),
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

// ── ✅ NAYA: Set Chat Lock Password ──────────────────────────────────────────
// ── ✅ SECURITY UPGRADE: Set/Update Chat Lock Password with Old Password Verification ──
export const setLockPassword = async (req, res) => {
  try {
    const { password, oldPassword } = req.body;
    const userId = req.user._id;

    if (!password || password.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters long" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 🔒 VERIFICATION LOGIC: Agar user pehle se password set kar chuka hai (Reset Mode)
    if (user.isChatLockSet && user.chatLockPassword) {
      if (!oldPassword) {
        return res.status(400).json({ error: "Current password is required to change settings" });
      }

      // Backend database se hashed purana password compare karega
      const isMatch = await bcrypt.compare(oldPassword, user.chatLockPassword);
      if (!isMatch) {
        return res.status(400).json({ error: "Incorrect current password. Verification failed." });
      }
    }

    // Agar first-time user hai ya purana password successfully match ho gaya hai, toh naya hash karo
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
// ── ✅ NAYA: Verify Chat Lock Password ───────────────────────────────────────
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

// ── ✅ NAYA: Toggle Lock Chat (Lock/Unlock) ──────────────────────────────────
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

// ── ✅ NAYA: Fetch Locked Users Only ─────────────────────────────────────────
export const getLockedUsers = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const loggedInUser = await User.findById(loggedInUserId);
    const lockedUserIds = loggedInUser.lockedChats || [];

    // Sirf unhi logo ki list jo lockedChats array me hain
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

        return {
          ...user.toObject(),
          lastMessage: lastMessage?.text ||
            (lastMessage?.image ? "📷 Photo" :
            lastMessage?.audio ? "🎤 Voice message" :
            lastMessage?.file ? `📎 ${lastMessage?.fileName || "File"}` : ""),
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

// ── Get Messages ─────────────────────────────────────────────────────────────
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

// ── Send Message ─────────────────────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { text, image, audio, file, fileName, fileType } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    const receiver = await User.findById(receiverId);
    if (receiver?.blockedUsers?.includes(senderId.toString())) {
      return res.status(403).json({ error: "You cannot message this user" });
    }

    let imageUrl, audioUrl, fileUrl;

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
    if (file) {
      const uploadResponse = await cloudinary.uploader.upload(file, {
        resource_type: "auto", folder: "file_messages",
      });
      fileUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId, receiverId, text,
      image: imageUrl, audio: audioUrl,
      file: fileUrl, fileName: fileName || null, fileType: fileType || null,
    });

    await newMessage.save();

    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) io.to(receiverSocketId).emit("newMessage", newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ── Delete Message ────────────────────────────────────────────────────────────
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

// ── Edit Message ──────────────────────────────────────────────────────────────
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

// ── Mark As Read ──────────────────────────────────────────────────────────────
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

// ── Add Reaction ──────────────────────────────────────────────────────────────
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

// ── Clear Chat ────────────────────────────────────────────────────────────────
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

// ── Block User ────────────────────────────────────────────────────────────────
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
