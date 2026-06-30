import express from "express";
import upload from "../middleware/upload.middleware.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  uploadImage,
  uploadVideo,
  getMyGallery,
  deleteMedia,
  toggleFavorite,
  getFavorites,
  getAlbums,
  convertPdfToWordController, // 🆕 Controller function imported
} from "../controllers/media.controller.js";

const router = express.Router();

// 🆕 0. PDF to Word Conversion Engine Endpoint (Accepts 'pdfFile' multipart parameter)
router.post("/pdf-to-word", upload.single("pdfFile"), convertPdfToWordController);

// 1. फोटो अपलोड एंडपॉइंट 
router.post("/upload", protectRoute, upload.single("file"), uploadImage);

// 2. वीडियो अपलोड एंडपॉइंट
router.post("/upload-video", protectRoute, upload.single("file"), uploadVideo);

// 3. यूजर की पूरी गैलरी गेट करने के लिए
router.get("/my-gallery", protectRoute, getMyGallery);

// 4. मीडिया डिलीट करने के लिए
router.delete("/:id", protectRoute, deleteMedia);

// 5. फेवरेट स्टेटस टॉगल (On/Off) करने के लिए
router.put("/favorite/:id", protectRoute, toggleFavorite);

// 6. केवल फेवरेट मीडिया लिस्ट गेट करने के लिए
router.get("/favorites", protectRoute, getFavorites);

// 7. ऑटोमैटिक एलबम्स डेटा गेट करने के लिए
router.get("/albums", protectRoute, getAlbums);

export default router;
