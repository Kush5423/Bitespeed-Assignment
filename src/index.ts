import 'reflect-metadata';
import express, { Request, Response } from 'express';
import { AppDataSource } from './data-source';
import { Contact } from './entities/Contact';
import * as dotenv from 'dotenv';
import { ContactService } from './services/ContactService';

dotenv.config();

const app = express();
const PORT = process.env.APP_PORT || 3000;

app.use(express.json());

AppDataSource.initialize()
    .then(() => {
        console.log('Data Source has been initialized!');

        const contactService = new ContactService();

        app.get('/', (req: Request, res: Response) => {
            res.send('Identity Reconciliation Service with TypeORM is running!');
        });

        app.post('/identify', async (req: Request, res: Response) => {
            const { email, phoneNumber } = req.body;

            if (phoneNumber && typeof phoneNumber !== 'string') {
                req.body.phoneNumber = String(phoneNumber);
            }

            try {
                const result = await contactService.identifyContact(req.body);
                res.status(200).json(result);
            } catch (error: any) {
                console.error('Error in /identify:', error);
                if (error.message === 'Email or phone number must be provided.') {
                    res.status(400).json({ error: error.message });
                } else {
                    res.status(500).json({ error: 'Internal Server Error' });
                }
            }
        });

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error('Error during Data Source initialization:', err);
    }); 