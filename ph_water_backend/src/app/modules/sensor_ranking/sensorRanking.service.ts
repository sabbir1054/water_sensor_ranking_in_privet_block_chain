// ✅ UPDATED services/sensorRankingService.ts
import fs from "fs";
import httpStatus from "http-status";
import Papa from "papaparse";
import path from "path";
import { getContract } from "../../../connection";
import ApiError from "../../../errors/ApiError";

const BATCH_SIZE = 100;

const processCSVBatch = async (link: string) => {
  const contract = await getContract();
  if (!contract) {
    throw new ApiError(httpStatus.NOT_FOUND, "Fabric connection failed.");
  }

  const filePath = path.join(process.cwd(), "uploads", path.basename(link));

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(filePath, "utf8");
  } catch (err) {
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

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    try {
      const response = await contract.submitTransaction(
        "batchAddSensorReadings",
        JSON.stringify(batch),
        new Date().toString()
      );
      const jsonString = Buffer.from(response).toString("utf8");
      console.log(`✅ Batch processed:`, jsonString);
    } catch (err) {
      console.error(`❌ Error submitting batch ${i / BATCH_SIZE + 1}:`, err);
    }
  }

  return `✅ All ${data.length} records processed in ${Math.ceil(data.length / BATCH_SIZE)} batches.`;
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
