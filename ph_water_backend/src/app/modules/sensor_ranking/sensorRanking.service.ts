// services/sensorRankingService.ts
import fs from "fs";
import httpStatus from "http-status";
import Papa from "papaparse";
import path from "path";
import { getContract } from "../../../connection";
import ApiError from "../../../errors/ApiError";

const BATCH_SIZE = 20000;

const csvUpload = async (link: string) => {
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

  const rawData = parsed.data as Array<{
    SensorID: string;
    Temp: string;
    Salinity: string;
    PH: string;
    NH4: string;
    DO: string;
    CA: string;
  }>;

  const addData = async (
    SensorID: string,
    Temp: string,
    PH: string,
    DO: string,
    NH4: string,
    CA: string,
    Salinity: string
  ) => {
    try {
      const result = await contract.submitTransaction(
        "addSensorReading",
        SensorID,
        Temp,
        PH,
        DO,
        NH4,
        CA,
        Salinity
      );
      const response = Buffer.from(result).toString("utf8");
      console.log(`✅ Added: ${SensorID}`);
      return response;
    } catch (err) {
      console.error(`❌ Failed to add ${SensorID}:`, err);
    }
  };

  for (let i = 0; i < rawData.length; i++) {
    const { SensorID, Temp, Salinity, PH, NH4, DO, CA } = rawData[i];

    if (!SensorID || !Temp || !Salinity || !PH || !NH4 || !DO || !CA) {
      console.warn(`⚠️ Skipping incomplete row at index ${i}`);
      continue;
    }

    await addData(
      SensorID.trim(),
      Temp.toString(),
      PH.toString(),
      DO.toString(),
      NH4.toString(),
      CA.toString(),
      Salinity.toString()
    );
  }

  console.log("🚀 All valid CSV data uploaded to blockchain.");
};
const getAllSensorRanks = async (pageSize = "50", bookmark = "") => {
  const contract = await getContract();
  if (!contract) {
    throw new ApiError(httpStatus.NOT_FOUND, "Fabric connection failed.");
  }

  try {
    const resultBuffer = await contract.evaluateTransaction("getAll");
    const jsonString = Buffer.from(resultBuffer).toString("utf8");

    let sensorRankings;
    try {
      sensorRankings = JSON.parse(jsonString);

      // 🔽 Sort descending by totalScore
      sensorRankings.sort((a: any, b: any) => b.totalScore - a.totalScore);
    } catch (err) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Invalid JSON from Fabric: " + jsonString
      );
    }

    return sensorRankings;
  } catch (err) {
    console.error("Error retrieving sensor rankings:", err);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to retrieve sensor rankings"
    );
  }
};

//batch upload service
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
      // return jsonString;
      console.log(`✅ :`, jsonString);
    } catch (err) {
      console.error(`❌ Error submitting batch ${i / BATCH_SIZE + 1}:`, err);
    }
  }

  return `✅ All ${data.length} records processed in ${Math.ceil(data.length / BATCH_SIZE)} batches`;
};

export const SensorRankingService = {
  csvUpload,
  getAllSensorRanks,
  processCSVBatch,
};
