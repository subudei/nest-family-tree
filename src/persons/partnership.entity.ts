import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Partnership {
  @PrimaryGeneratedColumn()
  id: number;

  // Link to the tree this partnership belongs to
  @Column()
  treeId: string;

  // The two partners (stored as person IDs)
  @Column()
  person1Id: number;

  @Column()
  person2Id: number;

  // Optional marriage details
  @Column({ type: 'text', nullable: true })
  marriageDate?: string;

  @Column({ type: 'text', nullable: true })
  marriagePlace?: string;

  // Divorced info
  @Column({ default: false })
  divorced: boolean;

  @Column({ type: 'text', nullable: true })
  divorceDate?: string;

  // Notes about the partnership
  @Column({ type: 'text', nullable: true })
  notes?: string;
}
