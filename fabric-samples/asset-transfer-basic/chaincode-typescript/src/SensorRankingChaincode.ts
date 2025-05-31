// ✅ FULLY UPDATED CHAINCODE: sensorContract.ts
import {
    Context,
    Contract,
    Info,
    Returns,
    Transaction,
} from 'fabric-contract-api';

interface SensorPerformance {
    sensorId: string;
    totalScore: number;
    readingCount: number;
    lastUpdated: string;
}

interface WeightPool {
    value: number;
    lastUpdated: string;
}

interface TimeSeriesPoint {
    timestamp: string;
    pH: number;
    Moisture: number;
    nh4: number;
    doValue: number;
    ca: number;
    temp: number;
    salinity: number;
}

@Info({
    title: 'SensorContract',
    description:
        'Smart contract for ranking water sensors and graph data storage',
})
export class SensorContract extends Contract {
    private readonly POOL_KEY = 'WEIGHT_POOL';
    private readonly GRAPH_KEY = 'GRAPH_VIEW';

    private async _getWeightPool(
        ctx: Context,
        timestamp: string
    ): Promise<WeightPool> {
        const buffer = await ctx.stub.getState(this.POOL_KEY);
        if (!buffer || buffer.length === 0) {
            const initial: WeightPool = {
                value: 50000,
                lastUpdated: timestamp,
            };
            await ctx.stub.putState(
                this.POOL_KEY,
                Buffer.from(JSON.stringify(initial))
            );
            return initial;
        }
        return JSON.parse(buffer.toString()) as WeightPool;
    }

    private async updateWeightPool(
        ctx: Context,
        delta: number,
        timestamp: string
    ): Promise<void> {
        const pool = await this._getWeightPool(ctx, timestamp);
        pool.value += delta;
        pool.lastUpdated = timestamp;
        await ctx.stub.putState(
            this.POOL_KEY,
            Buffer.from(JSON.stringify(pool))
        );
    }

    private async updateGraphView(
        ctx: Context,
        sensorId: string,
        timestamp: string,
        readings: Omit<TimeSeriesPoint, 'timestamp'>
    ): Promise<void> {
        const key = `${this.GRAPH_KEY}_${sensorId}`;
        const buffer = await ctx.stub.getState(key);
        let graphData: TimeSeriesPoint[] =
            buffer.length > 0 ? JSON.parse(buffer.toString()) : [];

        graphData.push({ timestamp, ...readings });
        await ctx.stub.putState(key, Buffer.from(JSON.stringify(graphData)));
    }

    @Transaction()
    @Returns('string')
    public async batchAddSensorReadings(
        ctx: Context,
        jsonData: string,
        timestamp: string
    ): Promise<string> {
        interface Reading {
            SensorID: string;
            Temp: string;
            Salinity: string;
            PH: string;
            NH4: string;
            DO: string;
            CA: string;
        }

        let readings: Reading[];
        try {
            readings = JSON.parse(jsonData);
        } catch {
            throw new Error('Invalid JSON format for sensor readings batch.');
        }

        const updates: Record<string, { totalScore: number; count: number }> =
            {};

        for (const r of readings) {
            if (
                !r.SensorID ||
                !r.Temp ||
                !r.PH ||
                !r.DO ||
                !r.NH4 ||
                !r.CA ||
                !r.Salinity
            )
                continue;

            const parsed = {
                temp: parseFloat(r.Temp),
                pH: parseFloat(r.PH),
                doValue: parseFloat(r.DO),
                nh4: parseFloat(r.NH4),
                ca: parseFloat(r.CA),
                salinity: parseFloat(r.Salinity),
                Moisture: parseFloat(r.Temp), // placeholder if separate moisture not present
            };

            const weight = this.calculateWeight(
                parsed.temp,
                parsed.pH,
                parsed.doValue,
                parsed.nh4,
                parsed.ca,
                parsed.salinity
            );

            if (!updates[r.SensorID])
                updates[r.SensorID] = { totalScore: 0, count: 0 };

            updates[r.SensorID].totalScore += weight;
            updates[r.SensorID].count += 1;

            // Update weight pool and graph view
            await this.updateWeightPool(ctx, weight > 0 ? -100 : 50, timestamp);
            await this.updateGraphView(ctx, r.SensorID, timestamp, parsed);
        }

        for (const SensorID in updates) {
            const key = `SENSOR_${SensorID}`;
            const dataBuffer = await ctx.stub.getState(key);

            let sensor: SensorPerformance =
                dataBuffer.length > 0
                    ? JSON.parse(dataBuffer.toString())
                    : {
                          sensorId: SensorID,
                          totalScore: 0,
                          readingCount: 0,
                          lastUpdated: '',
                      };

            const update = updates[SensorID];
            sensor.totalScore += update.totalScore;
            sensor.readingCount += update.count;
            sensor.lastUpdated = timestamp;

            await ctx.stub.putState(key, Buffer.from(JSON.stringify(sensor)));
        }

        return `✅ Processed ${readings.length} readings.`;
    }

    @Transaction(false)
    @Returns('string')
    public async getWeightPool(ctx: Context): Promise<string> {
        const pool = await this._getWeightPool(ctx, new Date().toString());
        return JSON.stringify(pool);
    }

    @Transaction(false)
    @Returns('string')
    public async getGraphViewBySensor(
        ctx: Context,
        sensorId: string
    ): Promise<string> {
        const key = `${this.GRAPH_KEY}_${sensorId}`;
        const buffer = await ctx.stub.getState(key);
        return buffer.length > 0 ? buffer.toString() : '[]';
    }

    @Transaction(false)
    @Returns('string')
    public async getAll(ctx: Context): Promise<string> {
        const allResult = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();

        while (!result.done) {
            const strValue = Buffer.from(
                result.value.value.toString()
            ).toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            allResult.push(record);
            result = await iterator.next();
        }

        return JSON.stringify(allResult);
    }
    @Transaction(false)
    @Returns('string')
    public async getRankedSensors(ctx: Context): Promise<string> {
        const iterator = await ctx.stub.getStateByRange('SENSOR_', 'SENSOR_~');
        const sensors: (SensorPerformance & { averageScore: number })[] = [];

        let result = await iterator.next();
        while (!result.done) {
            const sensor = JSON.parse(
                result.value.value.toString()
            ) as SensorPerformance;
            const averageScore =
                sensor.readingCount > 0
                    ? sensor.totalScore / sensor.readingCount
                    : 0;
            sensors.push({ ...sensor, averageScore });
            result = await iterator.next();
        }
        await iterator.close();

        sensors.sort((a, b) => b.averageScore - a.averageScore);
        return JSON.stringify(sensors);
    }

    private calculateWeight(
        temp: number,
        ph: number,
        doValue: number,
        nh4: number,
        ca: number,
        salinity: number
    ): number {
        let score = 0;
        if (temp >= 20 && temp <= 30) score++;
        else score--;
        if (ph >= 6.5 && ph <= 8.5) score++;
        else score--;
        if (doValue >= 5 && doValue <= 12) score++;
        else score--;
        if (nh4 >= 0 && nh4 <= 50) score++;
        else score--;
        if (ca >= 3 && ca <= 10) score++;
        else score--;
        if (salinity >= 0 && salinity <= 0.5) score++;
        else score--;
        return score; // -6 to +6
    }
}
