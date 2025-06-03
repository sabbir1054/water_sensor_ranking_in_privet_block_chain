import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const SensorScatterComparison = ({ mergedData }) => {
  const ph = mergedData.filter((d) => d.variable === "pH");
  const moisture = mergedData.filter((d) => d.variable === "Moisture");

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="text-xl font-semibold text-center mb-4">
        Sensor pH & Moisture Distribution
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart>
          <CartesianGrid />
          <XAxis type="number" dataKey="nodeId" name="Sensor Node" />
          <YAxis type="number" dataKey="value" name="Value" />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Legend />
          <Scatter name="Moisture" data={moisture} fill="#8884d8" />
          <Scatter name="pH" data={ph} fill="#ff0000" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SensorScatterComparison;
