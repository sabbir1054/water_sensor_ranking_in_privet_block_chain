import { Request, Response } from "express";
import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { SensorRankingService } from "./sensorRanking.service";
const csvUpload = catchAsync(async (req: Request, res: Response) => {
  const result = await SensorRankingService.csvUpload(req.body.file);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Upload done ",
    data: result,
  });
});

const processCSVBatch = catchAsync(async (req: Request, res: Response) => {
  const result = await SensorRankingService.processCSVBatch(req.body.file);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Upload done ",
    data: result,
  });
});
const getAllSensorRanks = catchAsync(async (req: Request, res: Response) => {
  const result = await SensorRankingService.getAllSensorRanks();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "retrive rank",
    data: result,
  });
});
export const SensorRankingController = {
  csvUpload,
  processCSVBatch,
  getAllSensorRanks,
};
