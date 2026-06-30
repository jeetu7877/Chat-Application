import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // 🆕 Checked if it's an image, video, OR standard PDF mimetype
  if (
    file.mimetype.startsWith("image/") || 
    file.mimetype.startsWith("video/") || 
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images, videos, and PDFs are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 🚀 Limit extended to 25MB taaki heavy PDFs crash na karein
  },
});

export default upload;
