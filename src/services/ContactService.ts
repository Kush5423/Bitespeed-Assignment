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
            // As per spec, at least one should be present. Handle error or return empty if allowed.
            // For now, let's assume this case is an error or won't happen based on problem description.
            // Depending on strictness, you might throw an error here.
            // For this example, let's return an empty-ish response or a specific error structure.
            // However, the problem implies one will always be there.
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

        // Find contacts that match either the provided email or phoneNumber, or both
        // Also include any contacts linked to them (either as primary to secondaries, or secondary to a primary)
        const initialMatchingContacts = await this.contactRepository.find({
            where: whereClauses.length > 0 ? whereClauses : undefined, // Ensure where is not empty
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
                // If it's a secondary, add its primary and all other secondaries of that primary
                const primary = await this.findUltimatePrimary(contact.primaryContact);
                allRelatedContacts.push(primary);
                if (primary.secondaryContacts) {
                    allRelatedContacts.push(...primary.secondaryContacts);
                }
            }
        }

        // Remove duplicates by ID
        const uniqueContactsMap = new Map<number, Contact>();
        allRelatedContacts.forEach(c => uniqueContactsMap.set(c.id, c));
        existingContacts = Array.from(uniqueContactsMap.values());

        // Sort by creation date to easily find the oldest primary
        existingContacts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (existingContacts.length === 0) {
            // Scenario 1: No existing contact, create a new primary contact
            const newContact = this.contactRepository.create({
                email: email || null,
                phoneNumber: phoneNumber || null,
                linkPrecedence: LinkPrecedence.PRIMARY,
            });
            await this.contactRepository.save(newContact);
            return this.formatResponse(newContact, []);
        }

        // Identify all unique primary contacts from the existing set
        const primaryContacts = existingContacts.filter(c => c.linkPrecedence === LinkPrecedence.PRIMARY);
        let chosenPrimary = primaryContacts.length > 0 ? primaryContacts[0] : await this.findUltimatePrimary(existingContacts[0]); // oldest is first due to sort

        // Consolidate if multiple primary contacts were found or if linking is needed
        if (primaryContacts.length > 1) {
            chosenPrimary = primaryContacts[0]; // Already sorted, oldest is first
            for (let i = 1; i < primaryContacts.length; i++) {
                const otherPrimary = primaryContacts[i];
                otherPrimary.linkedId = chosenPrimary.id;
                otherPrimary.linkPrecedence = LinkPrecedence.SECONDARY;
                await this.contactRepository.save(otherPrimary);
                // Update all secondaries of this now-secondary-primary to point to the new chosenPrimary
                if (otherPrimary.secondaryContacts && otherPrimary.secondaryContacts.length > 0) {
                    for (const secondary of otherPrimary.secondaryContacts) {
                        secondary.linkedId = chosenPrimary.id;
                        await this.contactRepository.save(secondary);
                    }
                }
            }
        }

        // Check if the incoming request introduces new information
        const currentEmails = new Set(existingContacts.map(c => c.email).filter(Boolean));
        const currentPhoneNumbers = new Set(existingContacts.map(c => c.phoneNumber).filter(Boolean));

        const isNewEmail = email && !currentEmails.has(email);
        const isNewPhoneNumber = phoneNumber && !currentPhoneNumbers.has(phoneNumber);

        if (isNewEmail || isNewPhoneNumber) {
            // Only create a new secondary if the exact combination doesn't already exist
            // or if one of the provided fields is new to the *entire group* of linked contacts.
            let createNewSecondary = true;
            if (email && phoneNumber) { // if both provided, check if this exact pair exists
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
                existingContacts.push(newSecondaryContact); // Add to list for response formatting
            }
        }

        // Refresh all contacts linked to the chosen primary for the final response
        const finalPrimary = await this.contactRepository.findOne({
            where: { id: chosenPrimary.id },
            relations: ["secondaryContacts"],
        });
        if (!finalPrimary) throw new Error('Primary contact disappeared unexpectedly'); // Should not happen

        const finalSecondaries = finalPrimary.secondaryContacts || [];

        return this.formatResponse(finalPrimary, finalSecondaries);
    }

    private async findUltimatePrimary(contact: Contact): Promise<Contact> {
        let current = contact;
        while (current.linkPrecedence === LinkPrecedence.SECONDARY && current.linkedId) {
            const parent = await this.contactRepository.findOneBy({ id: current.linkedId });
            if (!parent) break; // Should not happen in consistent data
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

        // Ensure primary's email/phone is first, then the rest unique
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