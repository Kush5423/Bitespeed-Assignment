import { AppDataSource } from '../data-source';
import { Contact, LinkPrecedence } from '../entities/Contact';
import { Repository, FindOptionsWhere, In } from 'typeorm';

interface IdentifyRequest {
    email?: string | null;
    phoneNumber?: string | null;
}

export interface ConsolidatedContactResponse {
    contact: {
        primaryContactId: number;
        emails: string[];
        phoneNumbers: string[];
        secondaryContactIds: number[];
    };
}

export class ContactService {
    private contactRepository: Repository<Contact>;

    constructor() {
        this.contactRepository = AppDataSource.getRepository(Contact);
    }

    async identifyContact(data: IdentifyRequest): Promise<ConsolidatedContactResponse> {
        const { email, phoneNumber } = data;

        if (!email && !phoneNumber) {
            throw new Error('Email or phone number must be provided.');
        }

        let existingContacts: Contact[] = [];
        const whereClauses: FindOptionsWhere<Contact>[] = [];

        if (email) {
            whereClauses.push({ email });
        }
        if (phoneNumber) {
            whereClauses.push({ phoneNumber });
        }

        const initialMatchingContacts = await this.contactRepository.find({
            where: whereClauses.length > 0 ? whereClauses : undefined,
            relations: ["primaryContact", "secondaryContacts"],
        });

        let allRelatedContacts: Contact[] = [];
        for (const contact of initialMatchingContacts) {
            if (contact.linkPrecedence === LinkPrecedence.PRIMARY) {
                allRelatedContacts.push(contact);
                if (contact.secondaryContacts) {
                    allRelatedContacts.push(...contact.secondaryContacts);
                }
            } else if (contact.primaryContact) {
                const primary = await this.findUltimatePrimary(contact.primaryContact);
                allRelatedContacts.push(primary);
                if (primary.secondaryContacts) {
                    allRelatedContacts.push(...primary.secondaryContacts);
                }
            }
        }

        const uniqueContactsMap = new Map<number, Contact>();
        allRelatedContacts.forEach(c => uniqueContactsMap.set(c.id, c));
        existingContacts = Array.from(uniqueContactsMap.values());
        existingContacts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (existingContacts.length === 0) {
            const newContact = this.contactRepository.create({
                email: email || null,
                phoneNumber: phoneNumber || null,
                linkPrecedence: LinkPrecedence.PRIMARY,
            });
            await this.contactRepository.save(newContact);
            return this.formatResponse(newContact, []);
        }

        const primaryContacts = existingContacts.filter(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
        let chosenPrimary = primaryContacts.length > 0 ? primaryContacts[0] : await this.findUltimatePrimary(existingContacts[0]);

        if (primaryContacts.length > 1) {
            chosenPrimary = primaryContacts[0];
            for (let i = 1; i < primaryContacts.length; i++) {
                const otherPrimary = primaryContacts[i];
                otherPrimary.linkedId = chosenPrimary.id;
                otherPrimary.linkPrecedence = LinkPrecedence.SECONDARY;
                await this.contactRepository.save(otherPrimary);
                if (otherPrimary.secondaryContacts && otherPrimary.secondaryContacts.length > 0) {
                    for (const secondary of otherPrimary.secondaryContacts) {
                        secondary.linkedId = chosenPrimary.id;
                        await this.contactRepository.save(secondary);
                    }
                }
            }
        }

        const currentEmails = new Set(existingContacts.map(c => c.email).filter(Boolean));
        const currentPhoneNumbers = new Set(existingContacts.map(c => c.phoneNumber).filter(Boolean));

        const isNewEmail = email && !currentEmails.has(email);
        const isNewPhoneNumber = phoneNumber && !currentPhoneNumbers.has(phoneNumber);

        if (isNewEmail || isNewPhoneNumber) {
            let createNewSecondary = true;
            if (email && phoneNumber) {
                const exactMatch = existingContacts.find(c => c.email === email && c.phoneNumber === phoneNumber);
                if (exactMatch) createNewSecondary = false;
            }

            if (createNewSecondary && ((email && !currentEmails.has(email)) || (phoneNumber && !currentPhoneNumbers.has(phoneNumber)))) {
                const newSecondaryContact = this.contactRepository.create({
                    email: email || null,
                    phoneNumber: phoneNumber || null,
                    linkedId: chosenPrimary.id,
                    linkPrecedence: LinkPrecedence.SECONDARY,
                });
                await this.contactRepository.save(newSecondaryContact);
                existingContacts.push(newSecondaryContact);
            }
        }

        const finalPrimary = await this.contactRepository.findOne({
            where: { id: chosenPrimary.id },
            relations: ["secondaryContacts"],
        });
        if (!finalPrimary) throw new Error('Primary contact disappeared unexpectedly');

        const finalSecondaries = finalPrimary.secondaryContacts || [];

        return this.formatResponse(finalPrimary, finalSecondaries);
    }

    private async findUltimatePrimary(contact: Contact): Promise<Contact> {
        let current = contact;
        while (current.linkPrecedence === LinkPrecedence.SECONDARY && current.linkedId) {
            const parent = await this.contactRepository.findOneBy({ id: current.linkedId });
            if (!parent) break;
            current = parent;
        }
        return current;
    }

    private formatResponse(primary: Contact, secondaries: Contact[]): ConsolidatedContactResponse {
        const allContacts = [primary, ...secondaries];

        const emails = new Set<string>();
        if (primary.email) emails.add(primary.email);
        allContacts.forEach(c => c.email && emails.add(c.email));

        const phoneNumbers = new Set<string>();
        if (primary.phoneNumber) phoneNumbers.add(primary.phoneNumber);
        allContacts.forEach(c => c.phoneNumber && phoneNumbers.add(c.phoneNumber));

        const distinctEmails = [primary.email, ...Array.from(emails).filter(e => e !== primary.email)].filter(Boolean) as string[];
        const distinctPhoneNumbers = [primary.phoneNumber, ...Array.from(phoneNumbers).filter(p => p !== primary.phoneNumber)].filter(Boolean) as string[];

        return {
            contact: {
                primaryContactId: primary.id,
                emails: distinctEmails,
                phoneNumbers: distinctPhoneNumbers,
                secondaryContactIds: secondaries.map(s => s.id).sort((a, b) => a - b),
            },
        };
    }
} 