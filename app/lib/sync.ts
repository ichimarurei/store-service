import { FastifyRedis } from '@fastify/redis';
import { isEmpty } from 'lodash';
import debitSchema from '../models/debit.schema';
import inventorySchema, { InventoryDocument } from '../models/inventory.schema';
import productSchema, { ProductDocument } from '../models/product.schema';
import receiptSchema, { ReceiptDocument } from '../models/receipt.schema';
import salesSchema, { SalesDocument } from '../models/sales.schema';
import handshakeDB from '../mongo';
import { processAnalytics } from './analytics';
import { DebitStatus } from './global';

const isBundleUnitMatching = (item: ProductDocument, unit: string): boolean => (item?.bundle?.node ? String(item.bundle.node?.unit) === unit : false);

const calculateQty = (item: ProductDocument, unit: string, qty: number) => {
    const qtyNum = isNaN(qty) ? 0 : qty;

    if (isBundleUnitMatching(item, unit)) {
        const bundleNum = item.bundle?.contain?.amount ?? 1;

        return qtyNum * (isNaN(bundleNum) ? 1 : bundleNum);
    }

    return qtyNum;
};

const countDiscount = (cost: number, discount?: number) => {
    const discountVal = discount ?? 0;
    const costNum = isNaN(cost) ? 0 : cost;
    const discountNum = isNaN(discountVal) ? 0 : discountVal;

    return !discountNum ? costNum : costNum - (costNum * discountNum) / 100;
};

const processReceipt = (items: ProductDocument[], receipts: ReceiptDocument[]) => {
    const prices: any = {};
    const inventories: any = {};
    console.info('calculating item stock in receipts ...');

    receipts.forEach(({ products }) =>
        products.forEach(({ product, qty, unit, cost, discount }) => {
            const item = items.find(({ _id }) => String(_id) === String(product));

            if (item) {
                const costVal = cost ?? 0;
                const costNum = isNaN(costVal) ? 0 : costVal;
                const qtyConverted = calculateQty(item, String(unit), qty);
                const unitPrice = !costNum ? 0 : Math.ceil(countDiscount(costNum, discount) / qtyConverted);

                if (!inventories[String(product)]) {
                    inventories[String(product)] = qtyConverted;
                } else {
                    inventories[String(product)] += qtyConverted;
                }

                if (!prices[String(product)]) {
                    prices[String(product)] = [unitPrice];
                } else {
                    prices[String(product)].push(unitPrice);
                }
            }
        })
    );

    return { inventories, prices };
};

const processSales = (items: ProductDocument[], sales: SalesDocument[], inventories: any) => {
    console.info('calculating item stock in sales ...');

    sales.forEach(({ products }) =>
        products.forEach(({ product, salesQty, bonusQty }) => {
            const item = items.find(({ _id }) => String(_id) === String(product));

            if (item) {
                inventories[String(product)] -= calculateQty(item, String(salesQty.unit), salesQty.qty);

                if (bonusQty) {
                    inventories[String(product)] -= calculateQty(item, String(bonusQty?.unit), bonusQty?.qty ?? 0);
                }
            }
        })
    );

    return inventories;
};

const processUpdating = async (items: ProductDocument[], receipts: ReceiptDocument[], sales: SalesDocument[]) => {
    const inbound = processReceipt(items, receipts);
    const prices = inbound.prices;
    const inventories = processSales(items, sales, inbound.inventories);
    const stacked = await inventorySchema.find().select('-__v').lean<InventoryDocument[]>();
    console.info('calculating item actual stock ...');

    if (isEmpty(inventories)) {
        for (const { product, inventory, cost } of stacked) {
            await productSchema.findOneAndUpdate({ _id: product }, { inventory, cost: [0, cost] }, { new: true, lean: true }).lean<ProductDocument>();
        }
    }

    for (const key in inventories) {
        const existing = items.find(({ _id }) => String(_id) === String(key));
        const stock = stacked.find(({ product }) => String(product) === String(key));
        const cost = [];

        if ((existing?.initialCost ?? 0) > 0) {
            cost.push(0);
            cost.push(existing?.initialCost ?? 0);
        } else if (prices[key]) {
            (prices[key] as number[]).sort((a, b) => a - b);

            if (prices[key].length > 1) {
                cost.push(prices[key][0]);
                cost.push(prices[key][prices[key].length - 1]);
            } else {
                cost.push(0);
                cost.push(prices[key][0]);
            }
        }

        if (isEmpty(cost)) {
            cost.push(0);
            cost.push(0);
        }

        const inventory = (isNaN(inventories?.[key]) ? 0 : inventories?.[key]) + (stock?.inventory ?? 0);
        await productSchema.findOneAndUpdate({ _id: key }, { inventory, cost }, { new: true, lean: true }).lean<ProductDocument>();
    }
};

const syncStock = async () => {
    let synced = false;

    try {
        await handshakeDB();
        console.info('fetching items ...');
        const items = await productSchema.find().sort({ name: 'asc' }).select('-__v').lean<ProductDocument[]>();
        console.info('fetching receipts ...');
        const receipts = await receiptSchema.find().sort({ date: 'asc' }).select('-__v').lean<ReceiptDocument[]>();
        console.info('fetching sales ...');
        const sales = await salesSchema.find().sort({ date: 'asc' }).select('-__v').lean<SalesDocument[]>();
        await processUpdating(items, receipts, sales);
        synced = true;
    } catch (_) {
        console.error(_);
    }

    return { synced };
};

export const cleansing = async (redis: FastifyRedis, stocks: any[]) => {
    try {
        await handshakeDB();
        console.info('Cleansing database ...');
        await inventorySchema.deleteMany({});
        console.info('Removal receipt & sales records ...');
        await receiptSchema.deleteMany({});
        await salesSchema.deleteMany({});
        console.info('Removal paid debt/loan records ...');
        await debitSchema.deleteMany({ status: DebitStatus.paid });
        console.info('Recalculating inventory & cost ...');
        await inventorySchema.insertMany(stocks);
        await syncStock(); // sync stock
        await processAnalytics(redis); // run analytics
    } catch (error) {
        console.error(error);
    }
};

export default syncStock;
