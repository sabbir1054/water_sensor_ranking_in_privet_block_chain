// ✅ FIXED CHAINCODE: sensorContract.ts
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

@Info({
    title: 'SensorContract',
    description: 'Smart contract for ranking water sensors',
})
export class SensorContract extends Contract {
    @Transaction()
    @Returns('string')
    public async addSensorReading(
        ctx: Context,
        sensorId: string,
        temp: string,
        ph: string,
        doValue: string,
        nh4: string,
        ca: string,
        salinity: string
    ): Promise<string> {
        const key = `SENSOR_${sensorId}`;

        const dataBuffer = await ctx.stub.getState(key);

        let sensor: SensorPerformance =
            dataBuffer.length > 0
                ? JSON.parse(dataBuffer.toString())
                : { sensorId, totalScore: 0, readingCount: 0, lastUpdated: '' };

        const weight = await this.calculateWeight(
            parseFloat(temp),
            parseFloat(ph),
            parseFloat(doValue),
            parseFloat(nh4),
            parseFloat(ca),
            parseFloat(salinity)
        );
        sensor.totalScore += weight;
        sensor.readingCount += 1;
        sensor.lastUpdated = new Date().toString();

        await ctx.stub.putState(key, Buffer.from(JSON.stringify(sensor)));
        return `DONE`;
    }
    //batch work
    @Transaction()
    @Returns('string')
    public async batchAddSensorReadings(
        ctx: Context,
        jsonData: string
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
        } catch (err) {
            throw new Error('Invalid JSON format for sensor readings batch.');
        }

        const updates: Record<string, { totalScore: number; count: number }> =
            {};
        let skipped = 0;
        let failedParse = 0;
        let failedToWrite = 0;

        for (const r of readings) {
            try {
                if (
                    !r.SensorID ||
                    !r.Temp ||
                    !r.PH ||
                    !r.DO ||
                    !r.NH4 ||
                    !r.CA ||
                    !r.Salinity
                ) {
                    skipped++;
                    continue;
                }

                const weight = this.calculateWeight(
                    parseFloat(r.Temp),
                    parseFloat(r.PH),
                    parseFloat(r.DO),
                    parseFloat(r.NH4),
                    parseFloat(r.CA),
                    parseFloat(r.Salinity)
                );

                if (!updates[r.SensorID]) {
                    updates[r.SensorID] = { totalScore: 0, count: 0 };
                }

                updates[r.SensorID].totalScore += weight;
                updates[r.SensorID].count += 1;
            } catch (e) {
                failedParse++;
                continue; // Continue to next reading
            }
        }

        for (const SensorID in updates) {
            try {
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

                // Defensive: make sure update exists before applying
                const update = updates[SensorID];
                if (!update) {
                    failedToWrite++;
                    continue;
                }

                sensor.totalScore += update.totalScore;
                sensor.readingCount += update.count;
                // sensor.lastUpdated = new Date().toString();

                await ctx.stub.putState(
                    key,
                    Buffer.from(JSON.stringify(sensor))
                );
            } catch (err) {
                console.error(`❌ Failed to update sensor ${SensorID}:`, err);
                failedToWrite++;
                continue;
            }
        }

        return JSON.stringify({
            totalRecords: readings.length,
            skippedIncomplete: skipped,
            failedParse,
            failedToWrite,
            updatedSensors: Object.keys(updates).length - failedToWrite,
        });
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

        return score; // Range: -6 to +6
    }

    @Transaction(false)
    @Returns('string')
    public async getSensor(ctx: Context, sensorId: string): Promise<string> {
        const key = `SENSOR_${sensorId}`;
        const buffer = await ctx.stub.getState(key);
        if (!buffer || buffer.length === 0) {
            throw new Error(`Sensor ${sensorId} not found.`);
        }
        return buffer.toString();
    }

    @Transaction(false)
    @Returns('string')
    public async getAllSensors(ctx: Context): Promise<string> {
        const iterator: any = await ctx.stub.getStateByRange(
            'SENSOR_',
            'SENSOR_~'
        );
        const result: SensorPerformance[] = [];

        for await (const res of iterator) {
            const sensor = JSON.parse(
                res.value.toString()
            ) as SensorPerformance;
            result.push(sensor);
        }

        const ranked = result
            .map((s) => ({
                ...s,
                averageScore: s.totalScore / s.readingCount,
            }))
            .sort((a, b) => b.averageScore - a.averageScore);

        return JSON.stringify(ranked);
    }

    @Transaction(false)
    @Returns('Buffer')
    public async getSensorsPaginated(
        ctx: Context,
        pageSizeStr: string,
        bookmark: string
    ): Promise<Buffer> {
        let pageSize = parseInt(pageSizeStr, 10);
        if (isNaN(pageSize) || pageSize <= 0) {
            pageSize = 10;
        }

        try {
            const response = await ctx.stub.getStateByRangeWithPagination(
                'SENSOR_',
                'SENSOR_~',
                pageSize,
                bookmark || ''
            );

            const results: any[] = [];
            const iterator = response.iterator;
            let result = await iterator.next();

            while (!result.done) {
                try {
                    const sensor = JSON.parse(result.value.value.toString());
                    const averageScore =
                        sensor.readingCount > 0
                            ? sensor.totalScore / sensor.readingCount
                            : 0;

                    results.push({
                        ...sensor,
                        averageScore,
                    });
                } catch (err) {
                    console.error('Corrupted entry:', result.value.key);
                }
                result = await iterator.next();
            }

            await iterator.close();

            const responsePayload = JSON.stringify({
                results,
                bookmark: response.metadata?.bookmark ?? '',
            });

            return Buffer.from(responsePayload);
        } catch (err) {
            throw new Error(
                'Failed to paginate sensor data: ' + (err as Error).message
            );
        }
    }

    // my trying
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
                record = JSON.parse(strValue) as SensorPerformance;
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            allResult.push(record);
            result = await iterator.next();
        }
        return JSON.stringify(allResult);
    }
}
