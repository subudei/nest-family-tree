import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Person } from '../persons/person.entity';

@Entity()
export class Tree {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Admin credentials
  @Column({ unique: true })
  adminUsername: string;

  @Column()
  adminPasswordHash: string;

  // Guest credentials (for sharing read-only access)
  @Column({ unique: true })
  guestUsername: string;

  @Column()
  guestPasswordHash: string;

  // Optional email for password recovery
  @Column({ nullable: true })
  ownerEmail?: string;

  // Optional owner name fields
  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relation to persons in this tree
  // Using string reference 'Person' to avoid circular dependency issues
  @OneToMany('Person', 'tree')
  persons: Person[];
}
