import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['user', 'agent', 'bot'],
    default: 'user',
  })
  sender: 'user' | 'agent' | 'bot';

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'simple-array', nullable: true })
  attachments: string[];

  @CreateDateColumn()
  createdAt: Date;
}