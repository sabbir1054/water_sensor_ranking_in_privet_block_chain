import express, { NextFunction, Request, Response } from "express";
import { FileUploadHelper } from "../../../helpers/fileuploader";
import { SensorRankingController } from "./sensorRanking.controller";

const router = express.Router();

router.post(
  "/uploadCsv",
  FileUploadHelper.upload.single("file"),
  (req: Request, res: Response, next: NextFunction) => {
    if (req.file) {
      req.body.file = `${req.file.filename}`;
    }
    return SensorRankingController.csvUpload(req, res, next);
  }
);
router.post(
  "/uploadCsv/batch",
  FileUploadHelper.upload.single("file"),
  (req: Request, res: Response, next: NextFunction) => {
    if (req.file) {
      req.body.file = `${req.file.filename}`;
    }
    return SensorRankingController.processCSVBatch(req, res, next);
  }
);

router.get("/", SensorRankingController.getAllSensorRanks);

export const SensorRangkigRoutes = router;
