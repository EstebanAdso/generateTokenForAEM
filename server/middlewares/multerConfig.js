import multer from "multer";
import fs from "fs";

const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const tempDir = './temp_uploads';
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir);
      },
      filename: (req, file, cb) => {
        // Mantener el nombre original del archivo
        cb(null, file.originalname);
      }
    })
  });

export default upload;
