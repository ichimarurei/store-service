import { FastifyRedis } from '@fastify/redis';
import { orderBy, take } from 'lodash';
import customerSchema from '../models/customer.schema';
import debitSchema, { DebitDocument } from '../models/debit.schema';
import productSchema from '../models/product.schema';
import salesSchema, { SalesDocument } from '../models/sales.schema';
import supplierSchema from '../models/supplier.schema';
import handshakeDB from '../mongo';
import { DebitStatus, STOCK_STATE } from './global';

type counter = { key: string; count: number; record?: any };

const _takeTop = (list: any[]) => take(orderBy(list, ['count'], ['desc']), 20);

const _calculateDebt = (list: DebitDocument[]) => {
    let sumDebt = 0;
    let sumLoan = 0;

    list.filter(({ status }) => status !== DebitStatus.paid).forEach(({ money, instalment, debt, loan }) => {
        let paid = 0;

        (instalment ?? []).forEach(({ money }) => {
            paid += money;
        });

        if (debt) {
            sumDebt += money - paid;
        }

        if (loan) {
            sumLoan += money - paid;
        }
    });

    return { debt: sumDebt, loan: sumLoan };
};

export const processAnalytics = async (redis: FastifyRedis) => {
    let analytics: any;

    try {
        await handshakeDB();
        const customers = await customerSchema.countDocuments();
        const suppliers = await supplierSchema.countDocuments();
        const products = await productSchema.countDocuments();
        const empties = await productSchema.countDocuments({ inventory: { $lte: 0 } });
        const items = await salesSchema
            .find()
            .select('-__v')
            .sort({ date: 'desc', 'author.edited.time': 'desc', 'author.created.time': 'desc' })
            .populate({ path: 'products.product', select: '-__v -author', populate: [{ path: 'category', select: '-__v' }] })
            .populate({ path: 'customer', select: '-__v' })
            .lean<SalesDocument[]>();
        const debts = await debitSchema.find().select('-__v').sort({ date: 'desc', 'author.edited.time': 'desc', 'author.created.time': 'desc' }).lean<DebitDocument[]>();
        const sales = items.map((item) => ({
            ...item,
            products: item.products.filter(({ product }) => product !== null)
        }));
        const recentSales: any[] = [];
        const tops: { categories: counter[]; customers: counter[]; products: counter[] } = { categories: [], customers: [], products: [] };
        let revenue = 0;

        sales.forEach(({ finalPrice, products, customer, _id }) => {
            revenue += finalPrice;

            if (customer?._id) {
                if (!tops.customers.find(({ key }) => key === String(customer?._id))) {
                    tops.customers.push({ key: String(customer?._id), record: customer, count: finalPrice });
                } else {
                    const index = tops.customers.findIndex(({ key }) => key === String(customer?._id));
                    tops.customers[index].count += finalPrice;
                }
            }

            products.forEach((item) => {
                if ((item.product as any)?.category?._id) {
                    if (!tops.categories.find(({ key }) => key === String((item.product as any).category._id))) {
                        tops.categories.push({ key: String((item.product as any).category._id), record: (item.product as any).category, count: 1 });
                    } else {
                        const index = tops.categories.findIndex(({ key }) => key === String((item.product as any).category._id));
                        tops.categories[index].count++;
                    }
                }

                if ((item.product as any)?._id) {
                    if (!tops.products.find(({ key }) => key === String((item.product as any)._id))) {
                        tops.products.push({ key: String((item.product as any)._id), record: item.product, count: 1 });
                    } else {
                        const index = tops.products.findIndex(({ key }) => key === String((item.product as any)._id));
                        tops.products[index].count++;
                    }
                }

                if (recentSales.length < 20) {
                    recentSales.push({ ...item, parent: _id });
                }
            });
        });

        analytics = {
            calculate: { ..._calculateDebt(debts), revenue },
            count: {
                customers,
                suppliers,
                products,
                empties,
                sales: sales.length,
                debts: debts.filter(({ debt, status }) => status !== DebitStatus.paid && debt !== null).length,
                loans: debts.filter(({ loan, status }) => status !== DebitStatus.paid && loan !== null).length
            },
            records: {
                sales: { recent: recentSales, all: sales },
                loans: debts.filter(({ loan }) => loan !== null),
                highest: { categories: _takeTop(tops.categories), products: _takeTop(tops.products), customers: _takeTop(tops.customers) }
            }
        };

        await redis.set('analytics', JSON.stringify(analytics));
    } catch (error) {
        console.error(error);
    }

    return analytics;
};

const analyzing = (redis: FastifyRedis) => {
    redis.get(STOCK_STATE.SYNC).then(async (state) => {
        if (!state) {
            const archiving = await redis.get(STOCK_STATE.TAKE);

            if (!archiving) {
                console.info('Analytics running ...');
                await processAnalytics(redis);
                console.info('Analytics done ...');
            }
        }
    });
};

export default analyzing;
