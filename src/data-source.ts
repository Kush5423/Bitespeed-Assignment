import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Contact } from './entities/Contact';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    synchronize: true,
    logging: false,
    entities: [Contact],
    migrations: [__dirname + '/migrations/*.{js,ts}'],
    subscribers: [],
} as DataSourceOptions); 