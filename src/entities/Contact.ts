import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index, OneToMany } from 'typeorm';

export enum LinkPrecedence {
    PRIMARY = 'primary',
    SECONDARY = 'secondary',
}

@Entity('contacts')
export class Contact {
    @PrimaryGeneratedColumn()
    id!: number;

    @Index()
    @Column({ type: 'varchar', nullable: true })
    phoneNumber?: string | null;

    @Index()
    @Column({ type: 'varchar', nullable: true })
    email?: string | null;

    @Index()
    @Column({ type: 'int', nullable: true })
    linkedId?: number | null;

    @ManyToOne(() => Contact, contact => contact.secondaryContacts, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'linkedId' })
    primaryContact?: Contact | null;

    @OneToMany(() => Contact, contact => contact.primaryContact)
    secondaryContacts?: Contact[];

    @Column({
        type: 'enum',
        enum: LinkPrecedence,
        default: LinkPrecedence.PRIMARY,
    })
    linkPrecedence!: LinkPrecedence;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    @Column({ type: 'timestamp', nullable: true })
    deletedAt?: Date | null;
} 