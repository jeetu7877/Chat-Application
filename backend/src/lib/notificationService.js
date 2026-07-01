import { messaging } from "./firebaseAdmin.js";
import User from "../models/user.model.js";

/**
 * Parses message layout data streams cleanly into short precise text strings
 */
const getPushMessageBody = (message) => {
  if (message.sharedContactId) return "👤 Contact";
  if (message.image) return "📷 Photo";
  if (message.audio) return "🎤 Voice Message";
  if (message.documentFile || message.file) return `📄 ${message.fileName || "Document"}`;
  if (message.locationUrl) return "📍 Location Shared";
  return message.text || "";
};

/**
 * Core Firebase Multicast dispatch engine skipping real-time active frontend window instances
 */
export const sendPushNotification = async ({ senderName, receiverId, message, chatId }) => {
  try {
    // Fail-safe guard route verification checking if engine is active
    if (!messaging) {
      console.warn("FCM delivery bypassed: Messaging engine not initialized.");
      return;
    }

    const receiver = await User.findById(receiverId);
     if (receiver && receiver.notificationsEnabled === false) {
      console.log(`🔕 Push skipped — user ${receiverId} has notifications disabled`);
      return;
    }
    if (!receiver || !receiver.fcmTokens || receiver.fcmTokens.length === 0) {
      return; // Safe execution escape route when target user has zero token links
    }

    const parsedBody = getPushMessageBody(message);

    // Multicast architectural delivery payload mapping setup
    const payload = {
      tokens: receiver.fcmTokens,
      notification: {
        title: "💬 My Chat",
        body: `${senderName}: ${parsedBody}`,
      },
      data: {
        type: "NEW_MESSAGE",
        chatId: String(chatId),
        senderId: String(message.senderId),
      },
      android: {
        priority: "high",
        notification: {
          channelId: "my_chat_messages",
          icon: "stock_ticker_update",
          color: "#075E54",
          clickAction: "OPEN_CHAT_ACTIVITY",
          tag: String(chatId), // Collapses subsequent unread nodes from exact same chat threads
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: "💬 My Chat",
              body: `${senderName}: ${parsedBody}`,
            },
            badge: 1,
            sound: "default",
            threadId: String(chatId), // Synchronous grouping parameters mapping for iOS
          },
        },
      },
    };

    const result = await messaging.sendEachForMulticast(payload);
    
    // Auto-purge loop tracking invalid/stale/expired tokens downstream
    if (result.failureCount > 0) {
      const expiredTokens = [];
      result.responses.forEach((resp, index) => {
        if (!resp.success) {
          const errCode = resp.error?.code;
          if (
            errCode === "messaging/invalid-argument" ||
            errCode === "messaging/registration-token-not-registered"
          ) {
            expiredTokens.push(receiver.fcmTokens[index]);
          }
        }
      });

      if (expiredTokens.length > 0) {
        await User.findByIdAndUpdate(receiverId, {
          $pull: { fcmTokens: { $in: expiredTokens } }
        });
        console.log(`Cleaned up ${expiredTokens.length} stale FCM tokens for user ${receiverId}`);
      }
    }
  } catch (error) {
    console.error("❌ FCM System Multicast Routing Failure:", error.message);
  }
};
