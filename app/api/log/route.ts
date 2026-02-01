
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { level, message, data } = body;

        const timestamp = new Date().toISOString();
        const prefix = `[CLIENT-${level.toUpperCase()}] [${timestamp}]`;

        let logMessage = `${prefix} ${message}`;
        if (data) {
            logMessage += ` | DATA: ${JSON.stringify(data, null, 2)}`;
        }

        console.log(logMessage);

        try {
            const logFile = path.join(process.cwd(), 'debug_client.log');
            fs.appendFileSync(logFile, logMessage + '\n---' + '\n');
        } catch (e) {
            console.error("Failed to write log to file:", e);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
