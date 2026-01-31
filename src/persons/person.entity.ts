import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tree } from '../trees/tree.entity';

@Entity()
export class Person {
  @PrimaryGeneratedColumn()
  id: number;

  // Link to the tree this person belongs to
  @Column()
  treeId: string;

  @ManyToOne(() => Tree, (tree) => tree.persons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'treeId' })
  tree: Tree;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  //FIXME: sqlite limitations with enums - use varchar with length limit as a workaround
  @Column({ type: 'varchar', length: 10 })
  // @Column({ type: 'enum', enum: ['male', 'female'] }) // Even Better (if you want DB-level validation):
  gender: 'male' | 'female';

  // SQLite stores dates as text (no native date type), so we use string in TypeScript
  // Format: ISO 8601 date string (e.g., "1990-01-15")
  @Column({ type: 'text', nullable: true })
  birthDate?: string;

  // SQLite stores dates as text (no native date type), so we use string in TypeScript
  // Format: ISO 8601 date string (e.g., "2020-12-31")
  @Column({ type: 'text', nullable: true })
  deathDate?: string;

  @Column({ type: 'text', nullable: true })
  trivia?: string;

  @Column({ default: false })
  progenitor: boolean;

  @Column({ nullable: true })
  fatherId?: number;

  @Column({ nullable: true })
  motherId?: number;

  // FIXME: replace id numbers with relations later once basic functionality is done
  // @ManyToOne(() => Person, { nullable: true })
  // @JoinColumn({ name: 'fatherId' })
  // father?: Person;

  // @ManyToOne(() => Person, { nullable: true })
  // @JoinColumn({ name: 'motherId' })
  // mother?: Person;
}
