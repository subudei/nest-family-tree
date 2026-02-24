import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Person } from '../persons/person.entity';
import type { User } from '../users/user.entity';

@Entity()
export class Tree {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Guest credentials (read-only access, shared with family members)
  @Column({ unique: true })
  guestUsername: string;

  @Column()
  guestPasswordHash: string;

  // Owner (the User who created and manages this tree)
  @Column()
  ownerId: string;

  @ManyToOne('User', 'trees', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relation to persons in this tree
  @OneToMany('Person', 'tree')
  persons: Person[];
}
