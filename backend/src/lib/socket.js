import { Server } from "socket.io";
import http from "http";
import express from "express";
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
          "http://localhost:5173",
          "https://starlit-moxie-782d49.netlify.app",
          "capacitor://localhost",
          "http://localhost",
          "https://localhost"
        ],
        credentials: true,
    }
});

export function getReceiverSocketId(userId){
    return userSocketMap[userId];
}

const userSocketMap = {}; // {userId: socketId}

io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId
    if(userId) userSocketMap[userId] = socket.id
    console.log("✅ User connected:", userId, "| socketId:", socket.id);
    console.log("📋 Current userSocketMap:", userSocketMap);
    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    // ===== CALLING FEATURE — Signaling Events =====

    socket.on("call-user", ({ to, from, offer, callType, callerInfo }) => {
        console.log(`📞 call-user: from=${from} to=${to}`);
        console.log("📋 userSocketMap at call time:", userSocketMap);
        const receiverSocketId = getReceiverSocketId(to);
        console.log("🎯 Resolved receiverSocketId:", receiverSocketId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("incoming-call", {
                from,
                offer,
                callType,
                callerInfo,
            });
            console.log("✅ incoming-call sent to", receiverSocketId);
        } else {
            console.log("❌ Receiver socketId not found for userId:", to);
            socket.emit("call-failed", { reason: "User is offline" });
        }
    });

    socket.on("answer-call", ({ to, answer }) => {
        console.log(`✅ answer-call: to=${to}`);
        console.log("📋 userSocketMap at answer time:", userSocketMap);
        const callerSocketId = getReceiverSocketId(to);
        console.log("🎯 Resolved callerSocketId:", callerSocketId);
        if (callerSocketId) {
            io.to(callerSocketId).emit("call-answered", { answer });
            console.log("✅ call-answered sent to", callerSocketId);
        } else {
            console.log("❌ Caller socketId not found for userId:", to);
        }
    });

    socket.on("reject-call", ({ to }) => {
        const callerSocketId = getReceiverSocketId(to);
        if (callerSocketId) {
            io.to(callerSocketId).emit("call-rejected");
        }
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        const targetSocketId = getReceiverSocketId(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("ice-candidate", { candidate });
        }
    });

    socket.on("end-call", ({ to }) => {
        const targetSocketId = getReceiverSocketId(to);
        if (targetSocketId) {
            io.to(targetSocketId).emit("call-ended");
        }
    });

    // ===== END Calling Events =====

    socket.on("disconnect", () => {
        console.log("❌ User disconnected:", userId, "| socketId:", socket.id);
        delete userSocketMap[userId];
        console.log("📋 userSocketMap after disconnect:", userSocketMap);
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
    })
});

export { io, app, server };
