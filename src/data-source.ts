import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Contact } from './entities/Contact';
import * as dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    synchronize: true, // true for development (auto-creates schema), false for production (use migrations)
    logging: false, // enable for debugging DB queries
    entities: [Contact], // or [__dirname + '/entities/*.{js,ts}']
    migrations: [__dirname + '/migrations/*.{js,ts}'],
    subscribers: [],
} as DataSourceOptions); 