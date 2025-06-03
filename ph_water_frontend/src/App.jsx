import axios from "axios";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast, Toaster } from "sonner";
import RankingChart from "./RankingChart";
import SensorRankingTable from "./SensorRankingTable";
import SpinnerOverlay from "./SpinnerOverlay";

function App() {
  const [tableData, setTableData] = useState([]);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [weightPool, setWeghtPool] = useState(0);
  const onDrop = (acceptedFiles) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile && selectedFile.type === "text/csv") {
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setMessage("");
    } else {
      setMessage("Only CSV files are allowed.");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    multiple: false,
  });
  const getWeightPool = () => {
    fetch(`http://localhost:5000/api/v1/ranking/weightPool`)
      .then((res) => res.json())
      .then((data) => setWeghtPool(data?.data?.value));
  };
  const getRanking = () => {
    fetch(`http://localhost:5000/api/v1/ranking`)
      .then((res) => res.json())
      .then((data) => setTableData(data?.data));
  };
  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a CSV file before submitting.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    console.log(formData);

    try {
      setUploading(true);
      setMessage("");

      const res = await axios.post(
        "http://localhost:5000/api/v1/ranking/uploadCsv/batch",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      console.log(res);

      setMessage("File uploaded successfully.");
      console.log(res?.data?.statusCode);
      if (res?.data?.statusCode == 200) {
        toast.success("Upload done");
        getRanking();

        getWeightPool();
      }
    } catch (err) {
      console.error(err);
      setMessage("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    getRanking();
    getWeightPool();
  }, []);
  console.log(tableData);

  if (uploading) {
    return <SpinnerOverlay />;
  }

  return (
    <>
      <Toaster position="top" />
      {/* Form for upload CV */}
      <div>
        <div className="max-w-md mx-auto mt-10 p-6 bg-[#1e1e2f] text-white rounded-lg shadow-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-white">
            Upload CSV File
          </h2>

          <div
            {...getRootProps()}
            className={`p-6 border-4 border-dashed rounded-lg text-center cursor-pointer transition duration-300 ${
              isDragActive
                ? "border-blue-400 bg-[#2a2a40]"
                : "border-gray-600 bg-[#2a2a40] hover:border-blue-500"
            }`}
          >
            <input {...getInputProps()} />
            <p className="text-gray-300">
              {fileName ||
                "📁 Drag and drop a CSV file here, or click to select"}
            </p>
          </div>

          {message && <p className="mt-3 text-sm text-yellow-400">{message}</p>}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className={`mt-5 w-full py-2 px-4 rounded-md font-medium transition ${
              uploading || !file
                ? "bg-gray-600 cursor-not-allowed text-gray-300"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {uploading ? "Uploading..." : "Submit CSV"}
          </button>
        </div>
        <h1 className="text-xl text-white text-center">
          Current Weight of the pool {weightPool}
        </h1>
        {tableData?.length > 0 && <SensorRankingTable data={tableData} />}
        {tableData?.length > 0 && <RankingChart data={tableData} />}
      </div>
    </>
  );
}

export default App;
