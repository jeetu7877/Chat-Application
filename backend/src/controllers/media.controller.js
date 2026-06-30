import Media from "../models/media.model.js";
import cloudinary from "../lib/cloudinary.js";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

// हेल्पर फंक्शन: मल्टार मेमोरी बफ़र को क्लाउडिनरी पर स्ट्रीम अपलोड करने के लिए
const streamUpload = (fileBuffer, resourceType) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: "camera_studio",
      },
      {
        resource_type: resourceType,
        folder: "camera_studio",
      },
      (error, result) => {
        if (result) resolve(result);
        else reject(error);
      }
    );
    stream.end(fileBuffer);
  });
};

// 🆕 0. POST /api/media/pdf-to-word (High Precision Conversion Engine)
export const convertPdfToWordController = async (req, res) => {
  let tempPdfPath = null;
  let targetDocxPath = null;

  try {
    // Check if memory buffer contains incoming dynamic data stream
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "No PDF file stream received on server worker." });
    }

    const uniqueId = Date.now();
    const originalFileName = req.file.originalname || "document.pdf";
    const baseCleanName = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || "document";
    
    // Render instance isolated /tmp storage allocation paths map rules
    const runtimeTmpDir = "/tmp";
    tempPdfPath = path.join(runtimeTmpDir, `Input_${uniqueId}_${originalFileName}`);
    const finalDocxName = `${baseCleanName}_Converted.docx`;
    targetDocxPath = path.join(runtimeTmpDir, finalDocxName);

    // Sync memory buffer into temporary isolated disk node
    fs.writeFileSync(tempPdfPath, req.file.buffer);

    // Dynamic configuration engine maps: checks path for custom cloud Linux packages structure 
   // Check execution environment bounds cleanly
// ─── HIGH PRECISION ABSOLUTE PATH ENGINE ───
// --- DYNAMIC PATH LOCATOR FOR RENDER WORKSPACE ---
const isRenderLinux = fs.existsSync("/opt/render") || process.env.RENDER === "true";
const projectRoot = path.resolve();

let binaryPath = "libreoffice"; // Fallback local engine command

if (isRenderLinux) {
  // Path Option A (Jo hum expect kar rahe hain)
  const optionA = path.join(projectRoot, 'libreoffice', 'instdir', 'program', 'soffice');
  // Path Option B (Agar tar command bina upper directory layer ke extract hui ho)
  const optionB = path.join(projectRoot, 'libreoffice', 'program', 'soffice');
  
  if (fs.existsSync(optionA)) {
    binaryPath = optionA;
  } else if (fs.existsSync(optionB)) {
    binaryPath = optionB;
  } else {
    // Universal dynamic recovery check: direct system directory me binary locate karo
    const standardBinaryCheck = path.join(projectRoot, 'libreoffice', 'soffice');
    binaryPath = fs.existsSync(standardBinaryCheck) ? standardBinaryCheck : optionA;
  }
}

// Final High Precision CLI String Setup
const libreOfficeCommand = isRenderLinux
  ? `"${binaryPath}" --headless --infilter="writer_pdf_import" --convert-to docx --outdir "${runtimeTmpDir}" "${tempPdfPath}"`
  : `libreoffice --headless --infilter="writer_pdf_import" --convert-to docx --outdir "${runtimeTmpDir}" "${tempPdfPath}"`;
    exec(libreOfficeCommand, (execError, stdout, stderr) => {
      if (execError) {
        console.error("LibreOffice CLI Invalidation Error:", execError);
        cleanupTemporaryFiles(tempPdfPath, targetDocxPath);
        return res.status(500).json({ message: "Conversion failed: Server machine does not provide standard LibreOffice layout filters." });
      }

      // LibreOffice extracts with same root name string
      const generatedTempDocxPath = path.join(runtimeTmpDir, `${path.basename(tempPdfPath, path.extname(tempPdfPath))}.docx`);

      if (fs.existsSync(generatedTempDocxPath)) {
        fs.renameSync(generatedTempDocxPath, targetDocxPath);
      }

      if (!fs.existsSync(targetDocxPath)) {
        cleanupTemporaryFiles(tempPdfPath, targetDocxPath);
        return res.status(500).json({ message: "Target compiled artifact file not found inside memory workspace loops." });
      }

      // Direct download hardware binary response pipeline stream injection
      res.download(targetDocxPath, finalDocxName, (downloadErr) => {
        // Immediate cleanup sequence to avoid disk choking
        cleanupTemporaryFiles(tempPdfPath, targetDocxPath);

        if (downloadErr) {
          console.error("Buffer transmission cut:", downloadErr);
        }
      });
    });

  } catch (error) {
    console.error("Global Controller Error Context:", error);
    cleanupTemporaryFiles(tempPdfPath, targetDocxPath);
    res.status(500).json({ message: "Internal processing crash inside PDF controller pipeline layer." });
  }
};

// Housekeeping helper method to purge temporary files instantly
const cleanupTemporaryFiles = (pdfPath, docxPath) => {
  try {
    if (pdfPath && fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    if (docxPath && fs.existsSync(docxPath)) fs.unlinkSync(docxPath);
  } catch (e) {
    console.warn("Disk purge warning logs:", e);
  }
};

// 1. POST /api/media/upload (Photos के लिए)
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image file uploaded" });

    // मेमोरी बफ़र से सीधे क्लाउडिनरी पर अपलोड करें
    const result = await streamUpload(req.file.buffer, "image");

    const newMedia = new Media({
      userId: req.user._id,
      mediaUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      mediaType: "image",
      width: result.width || 0,
      height: result.height || 0,
      caption: req.body.caption || "",
      filtersUsed: req.body.filtersUsed || "original",
    });

    await newMedia.save();
    res.status(201).json({ message: "Image uploaded successfully", data: newMedia });
  } catch (error) {
    console.error("Error in uploadImage:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 2. POST /api/media/upload-video (Videos के लिए)
export const uploadVideo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No video file uploaded" });

    // वीडियो को क्लाउडिनरी पर स्ट्रीम करें
    const result = await streamUpload(req.file.buffer, "video");

    const newMedia = new Media({
      userId: req.user._id,
      mediaUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      mediaType: "video",
      width: result.width || 0,
      height: result.height || 0,
      duration: Math.round(result.duration) || 0,
      caption: req.body.caption || "",
    });

    await newMedia.save();
    res.status(201).json({ message: "Video uploaded successfully", data: newMedia });
  } catch (error) {
    console.error("Error in uploadVideo:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 3. GET /api/media/my-gallery
export const getMyGallery = async (req, res) => {
  try {
    const gallery = await Media.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json(gallery);
  } catch (error) {
    console.error("Error in getMyGallery:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 4. DELETE /api/media/:id
export const deleteMedia = async (req, res) => {
  try {
    const media = await Media.findOne({ _id: req.params.id, userId: req.user._id });
    if (!media) return res.status(404).json({ message: "Media not found or unauthorized" });

    // क्लाउडिनरी से फाइल डिलीट करें
    await cloudinary.uploader.destroy(media.cloudinaryPublicId, {
      resource_type: media.mediaType,
    });

    // डेटाबेस से एंट्री डिलीट करें
    await Media.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: "Media deleted successfully" });
  } catch (error) {
    console.error("Error in deleteMedia:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 5. PUT /api/media/favorite/:id
export const toggleFavorite = async (req, res) => {
  try {
    const media = await Media.findOne({ _id: req.params.id, userId: req.user._id });
    if (!media) return res.status(404).json({ message: "Media not found" });

    media.isFavorite = !media.isFavorite;
    await media.save();

    res.status(200).json({ message: "Favorite status updated", data: media });
  } catch (error) {
    console.error("Error in toggleFavorite:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 6. GET /api/media/favorites
export const getFavorites = async (req, res) => {
  try {
    const favorites = await Media.find({ userId: req.user._id, isFavorite: true }).sort({ createdAt: -1 });
    res.status(200).json(favorites);
  } catch (error) {
    console.error("Error in getFavorites:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// 7. GET /api/media/albums
export const getAlbums = async (req, res) => {
  try {
    const userId = req.user._id;

    // अलग-अलग एलबम्स के लिए एक साथ काउन्ट्स और डेटा पैच करें
    const allMedia = await Media.find({ userId }).sort({ createdAt: -1 });
    const photos = allMedia.filter((m) => m.mediaType === "image");
    const videos = allMedia.filter((m) => m.mediaType === "video");
    const favorites = allMedia.filter((m) => m.isFavorite === true);
    const edited = allMedia.filter((m) => m.filtersUsed && m.filtersUsed !== "original");

    res.status(200).json({
      allMedia,
      photos,
      videos,
      favorites,
      edited,
      recent: allMedia.slice(0, 15), 
    });
  } catch (error) {
    console.error("Error in getAlbums:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
