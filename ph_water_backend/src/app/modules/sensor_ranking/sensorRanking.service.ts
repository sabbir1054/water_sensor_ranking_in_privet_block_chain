// ✅ UPDATED services/sensorRankingService.ts
import pLimit from "@esm2cjs/p-limit";
import fs from "fs";
import httpStatus from "http-status";
import Papa from "papaparse";
import path from "path";
import { getContract } from "../../../connection";
import ApiError from "../../../errors/ApiError";

const MICRO_BATCH_SIZE = 1000;
const PARALLEL_LIMIT = 10;

const processCSVBatch = async (link: string) => {
  const limit = pLimit(PARALLEL_LIMIT);
  const contract = await getContract();

  if (!contract) {
    throw new ApiError(httpStatus.NOT_FOUND, "Fabric connection failed.");
  }

  const filePath = path.join(process.cwd(), "uploads", path.basename(link));
  let fileContent: string;

  try {
    fileContent = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new ApiError(httpStatus.BAD_REQUEST, "File not found or unreadable.");
  }

  const parsed = Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "CSV parsing error.");
  }

  const data = parsed.data as Array<{
    SensorID: string;
    Temp: string;
    Salinity: string;
    PH: string;
    NH4: string;
    DO: string;
    CA: string;
  }>;

  const promises: Promise<void>[] = [];

  for (let i = 0; i < data.length; i += MICRO_BATCH_SIZE) {
    const batch = data.slice(i, i + MICRO_BATCH_SIZE);
    const timestamp = new Date().toISOString();
    const batchNumber = Math.floor(i / MICRO_BATCH_SIZE) + 1;

    promises.push(
      limit(async () => {
        try {
          const response = await contract.submitTransaction(
            "addBatchSensorReadings",
            JSON.stringify(batch),
            timestamp
          );
          const result = Buffer.from(response).toString("utf8");
          console.log(`✅ Micro-batch ${batchNumber} processed:`, result);
        } catch (err) {
          console.error(`❌ Error in micro-batch ${batchNumber}:`, err);
        }
      })
    );
  }

  await Promise.allSettled(promises);
  return `✅ All ${data.length} records processed in ${Math.ceil(data.length / MICRO_BATCH_SIZE)} micro-batches.`;
};
const getAllSensorRanks = async () => {
  const contract = await getContract();
  if (!contract) {
    throw new ApiError(httpStatus.NOT_FOUND, "Fabric connection failed.");
  }

  try {
    const resultBuffer = await contract.evaluateTransaction("getRankedSensors");
    const jsonString = Buffer.from(resultBuffer).toString("utf8");
    return JSON.parse(jsonString);
  } catch (err) {
    console.log(err);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to retrieve ranked sensors"
    );
  }
};

// ✅ New Service: Get Graph Data for a Specific Sensor
const getSensorGraphData = async (sensorId: string) => {
  if (!sensorId) {
    throw new ApiError(httpStatus.NOT_FOUND, "Enter Valid Sensor-id");
  }
  const contract = await getContract();
  if (!contract) {
    throw new ApiError(httpStatus.NOT_FOUND, "Fabric connection failed.");
  }

  try {
    const resultBuffer = await contract.evaluateTransaction(
      "getGraphViewBySensor",
      sensorId
    );
    const jsonString = Buffer.from(resultBuffer).toString("utf8");
    return JSON.parse(jsonString);
  } catch (err) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get graph data for ${sensorId}`
    );
  }
};

// ✅ New Service: Get Current Weight Pool
const getWeightPool = async () => {
  const contract = await getContract();
  if (!contract) {
    throw new ApiError(httpStatus.NOT_FOUND, "Fabric connection failed.");
  }

  try {
    const resultBuffer = await contract.evaluateTransaction("getWeightPool");
    const jsonString = Buffer.from(resultBuffer).toString("utf8");
    return JSON.parse(jsonString);
  } catch (err) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to get weight pool"
    );
  }
};

export const SensorRankingService = {
  processCSVBatch,
  getAllSensorRanks,
  getSensorGraphData,
  getWeightPool,
};
