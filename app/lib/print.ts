import { sample } from 'lodash';
import { getPrinters, isPrintComplete } from 'unix-print';
import { ExecResponse, Printer } from 'unix-print/build/types';

const pickRandPrinter = async () => {
    let printer: Printer | undefined;

    try {
        const printers = await getPrinters();
        printer = sample(printers.filter(({ status }) => status === 'idle'));
    } catch (error) {
        console.error(error);
    }

    return printer ?? null;
};

const awaitPrinting = async (job: ExecResponse) => {
    while (!(await isPrintComplete(job))) {
        await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait for 1.5 seconds
    }

    return true;
};

export { awaitPrinting, pickRandPrinter };
