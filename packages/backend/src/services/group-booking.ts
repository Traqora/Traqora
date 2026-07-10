import { AppDataSource } from '../db/dataSource';
import { GroupBooking, GroupBookingStatus } from '../db/entities/GroupBooking';
import { GroupMember, GroupMemberStatus } from '../db/entities/GroupMember';
import { Booking } from '../db/entities/Booking';
import { Flight } from '../db/entities/Flight';
import { Passenger } from '../db/entities/Passenger';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface CreateGroupBookingRequest {
  groupName: string;
  flightId: string;
  organizerEmail: string;
  organizerWalletAddress?: string;
  memberEmails: string[];
  splitMethod: 'equal' | 'custom' | 'percentage';
  splitConfig?: Record<string, number>;
  notes?: string;
}

export interface GroupMemberInput {
  email: string;
  firstName?: string;
  lastName?: string;
  stellarAddress?: string;
  shareAmountCents?: number;
}

export interface InviteMembersRequest {
  groupBookingId: string;
  memberEmails: string[];
  customMessage?: string;
}

export interface UpdateSplitRequest {
  splitMethod: 'equal' | 'custom' | 'percentage';
  splitConfig?: Record<string, number>;
}

export class GroupBookingService {
  private static instance: GroupBookingService;
  private notificationService: NotificationService;

  private constructor() {
    this.notificationService = NotificationService.getInstance();
  }

  public static getInstance(): GroupBookingService {
    if (!GroupBookingService.instance) {
      GroupBookingService.instance = new GroupBookingService();
    }
    return GroupBookingService.instance;
  }

  /**
   * Create a new group booking
   */
  async createGroupBooking(request: CreateGroupBookingRequest): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const flightRepo = AppDataSource.getRepository(Flight);

    // Validate flight exists
    const flight = await flightRepo.findOne({
      where: { id: request.flightId },
    });

    if (!flight) {
      throw new Error('Flight not found');
    }

    // Calculate total amount based on number of members
    const totalAmountCents = request.memberEmails.length * flight.priceCents;

    // Create group booking
    const groupBooking = groupBookingRepo.create({
      groupName: request.groupName,
      flightId: request.flightId,
      status: 'pending',
      totalAmountCents,
      paidAmountCents: 0,
      splitMethod: request.splitMethod,
      splitConfig: request.splitConfig,
      organizerEmail: request.organizerEmail,
      organizerWalletAddress: request.organizerWalletAddress,
      notes: request.notes,
    });

    const savedGroup = await groupBookingRepo.save(groupBooking);

    // Create members
    const memberRepo = AppDataSource.getRepository(GroupMember);
    const members: GroupMember[] = [];

    // Add organizer as first member
    const organizerMember = memberRepo.create({
      groupBooking: savedGroup,
      groupBookingId: savedGroup.id,
      email: request.organizerEmail,
      status: 'confirmed',
      role: 'organizer',
      isInvited: true,
      invitedAt: new Date(),
      confirmedAt: new Date(),
      inviteToken: uuidv4(),
    });
    members.push(organizerMember);

    // Add other members
    for (const email of request.memberEmails) {
      // Skip if same as organizer
      if (email === request.organizerEmail) continue;

      const member = memberRepo.create({
        groupBooking: savedGroup,
        groupBookingId: savedGroup.id,
        email,
        status: 'pending',
        role: 'member',
        isInvited: false,
        inviteToken: uuidv4(),
      });
      members.push(member);
    }

    await memberRepo.save(members);

    // Calculate and assign shares based on split method
    await this.calculateMemberShares(savedGroup.id);

    logger.info(`Group booking created: ${savedGroup.id} with ${members.length} members`);

    return savedGroup;
  }

  /**
   * Calculate member shares based on split method
   */
  async calculateMemberShares(groupBookingId: string): Promise<void> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) {
      throw new Error('Group booking not found');
    }

    const confirmedMembers = group.members.filter(
      (m) => m.status === 'confirmed' || m.role === 'organizer'
    );

    if (confirmedMembers.length === 0) {
      return;
    }

    let shares: Record<string, number> = {};

    switch (group.splitMethod) {
      case 'equal':
        const equalShare = Math.floor(group.totalAmountCents / confirmedMembers.length);
        for (const member of confirmedMembers) {
          shares[member.id] = equalShare;
        }
        // Distribute remainder to first member
        const remainder = group.totalAmountCents - equalShare * confirmedMembers.length;
        if (remainder > 0 && confirmedMembers.length > 0) {
          shares[confirmedMembers[0].id] = equalShare + remainder;
        }
        break;

      case 'custom':
        if (group.splitConfig) {
          for (const member of confirmedMembers) {
            shares[member.id] = group.splitConfig[member.id] || 0;
          }
        }
        break;

      case 'percentage':
        if (group.splitConfig) {
          for (const member of confirmedMembers) {
            const percentage = group.splitConfig[member.id] || 0;
            shares[member.id] = Math.floor((group.totalAmountCents * percentage) / 100);
          }
        }
        break;

      default:
        break;
    }

    // Update member shares
    for (const member of confirmedMembers) {
      if (shares[member.id] !== undefined) {
        member.shareAmountCents = shares[member.id];
        await memberRepo.save(member);
      }
    }

    logger.info(`Member shares calculated for group ${groupBookingId}`);
  }

  /**
   * Invite members to join a group booking
   */
  async inviteMembers(request: InviteMembersRequest): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const group = await groupBookingRepo.findOne({
      where: { id: request.groupBookingId },
      relations: ['members'],
    });

    if (!group) {
      throw new Error('Group booking not found');
    }

    if (group.status === 'confirmed' || group.status === 'cancelled') {
      throw new Error('Group booking is already confirmed or cancelled');
    }

    const newMembers: GroupMember[] = [];

    for (const email of request.memberEmails) {
      // Check if member already exists
      const existing = group.members.find((m) => m.email === email);
      if (existing) {
        if (!existing.isInvited) {
          existing.isInvited = true;
          existing.invitedAt = new Date();
          existing.inviteToken = uuidv4();
          await memberRepo.save(existing);
        }
        continue;
      }

      const member = memberRepo.create({
        groupBooking: group,
        groupBookingId: group.id,
        email,
        status: 'pending',
        role: 'member',
        isInvited: true,
        invitedAt: new Date(),
        inviteToken: uuidv4(),
      });
      newMembers.push(member);
    }

    if (newMembers.length > 0) {
      await memberRepo.save(newMembers);
      // Recalculate shares
      await this.calculateMemberShares(group.id);
    }

    // Send invitation emails
    const allMembers = [...group.members, ...newMembers];
    const invitedMembers = allMembers.filter((m) => m.isInvited && m.status === 'pending');

    for (const member of invitedMembers) {
      await this.sendInvitationEmail(member, group);
    }

    group.status = 'inviting';
    await groupBookingRepo.save(group);

    logger.info(`Invitations sent for group ${group.id} to ${invitedMembers.length} members`);

    return group;
  }

  /**
   * Send invitation email to a member
   */
  private async sendInvitationEmail(member: GroupMember, group: GroupBooking): Promise<void> {
    const inviteLink = `${process.env.FRONTEND_URL}/book/group/invite/${member.inviteToken}`;

    const subject = `You're invited to join a group booking: ${group.groupName}`;

    const body = `
      <h2>Group Booking Invitation</h2>
      <p>You've been invited to join <strong>${group.groupName}</strong>.</p>
      <p>${group.organizerEmail} is organizing a group flight booking.</p>
      <p><a href="${inviteLink}">Click here to accept the invitation</a></p>
      <p>If you have any questions, please contact ${group.organizerEmail}.</p>
    `;

    await this.notificationService.sendEmail(member.email, subject, body);

    logger.info(`Invitation sent to ${member.email} for group ${group.id}`);
  }

  /**
   * Accept group booking invitation
   */
  async acceptInvitation(token: string, memberData: {
    firstName?: string;
    lastName?: string;
    stellarAddress?: string;
  }): Promise<GroupMember> {
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const member = await memberRepo.findOne({
      where: { inviteToken: token },
      relations: ['groupBooking'],
    });

    if (!member) {
      throw new Error('Invalid or expired invitation token');
    }

    if (member.status === 'confirmed') {
      throw new Error('You have already accepted this invitation');
    }

    member.firstName = memberData.firstName || member.firstName;
    member.lastName = memberData.lastName || member.lastName;
    member.stellarAddress = memberData.stellarAddress || member.stellarAddress;
    member.status = 'confirmed';
    member.confirmedAt = new Date();

    await memberRepo.save(member);

    // Recalculate shares
    await this.calculateMemberShares(member.groupBookingId);

    // Check if all members have confirmed
    await this.checkAllMembersConfirmed(member.groupBookingId);

    logger.info(`Member ${member.email} accepted invitation for group ${member.groupBookingId}`);

    return member;
  }

  /**
   * Check if all members have confirmed and update group status
   */
  private async checkAllMembersConfirmed(groupBookingId: string): Promise<void> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const members = await memberRepo.find({
      where: { groupBookingId },
    });

    const allConfirmed = members.every(
      (m) => m.status === 'confirmed' || m.role === 'organizer'
    );

    if (allConfirmed) {
      const group = await groupBookingRepo.findOne({
        where: { id: groupBookingId },
      });

      if (group && group.status === 'inviting') {
        group.status = 'awaiting_payment';
        await groupBookingRepo.save(group);
        logger.info(`Group ${groupBookingId} all members confirmed, ready for payment`);
      }
    }
  }

  /**
   * Update split method and recalculate shares
   */
  async updateSplitMethod(
    groupBookingId: string,
    request: UpdateSplitRequest
  ): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) {
      throw new Error('Group booking not found');
    }

    if (group.status === 'confirmed' || group.status === 'cancelled') {
      throw new Error('Cannot update split method after confirmation');
    }

    group.splitMethod = request.splitMethod;
    group.splitConfig = request.splitConfig;

    await groupBookingRepo.save(group);
    await this.calculateMemberShares(groupBookingId);

    logger.info(`Split method updated for group ${groupBookingId}`);

    return group;
  }

  /**
   * Process payment for a group member
   */
  async processMemberPayment(
    groupBookingId: string,
    memberId: string,
    paymentAmountCents: number
  ): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) {
      throw new Error('Group booking not found');
    }

    const member = group.members.find((m) => m.id === memberId);

    if (!member) {
      throw new Error('Member not found');
    }

    if (member.status === 'paid') {
      throw new Error('Member has already paid');
    }

    // Validate payment amount matches share
    if (member.shareAmountCents && paymentAmountCents !== member.shareAmountCents) {
      throw new Error(`Payment amount must be exactly ${member.shareAmountCents} cents`);
    }

    member.status = 'paid';
    await memberRepo.save(member);

    // Update paid amount
    group.paidAmountCents = (group.paidAmountCents || 0) + paymentAmountCents;

    // Check if all members have paid
    const allPaid = group.members.every(
      (m) => m.status === 'paid' || m.role === 'organizer'
    );

    if (allPaid) {
      group.status = 'paid';
      // Process group booking confirmation
      await this.confirmGroupBooking(group.id);
    } else {
      group.status = 'partial_paid';
    }

    await groupBookingRepo.save(group);

    logger.info(`Payment processed for member ${memberId} in group ${groupBookingId}`);

    return group;
  }

  /**
   * Confirm group booking after all payments are complete
   */
  private async confirmGroupBooking(groupBookingId: string): Promise<void> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const bookingRepo = AppDataSource.getRepository(Booking);
    const passengerRepo = AppDataSource.getRepository(Passenger);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) {
      throw new Error('Group booking not found');
    }

    // Create individual bookings for each member
    for (const member of group.members) {
      // Create passenger
      const passenger = passengerRepo.create({
        email: member.email,
        firstName: member.firstName || 'Guest',
        lastName: member.lastName || 'User',
        sorobanAddress: member.stellarAddress || '',
      });

      const savedPassenger = await passengerRepo.save(passenger);

      // Create booking
      const booking = bookingRepo.create({
        flight: { id: group.flightId } as any,
        passenger: savedPassenger,
        amountCents: member.shareAmountCents || 0,
        status: 'confirmed',
        idempotencyKey: `group_${group.id}_member_${member.id}`,
      });

      await bookingRepo.save(booking);

      logger.info(`Individual booking created for member ${member.email}`);
    }

    group.status = 'confirmed';
    await groupBookingRepo.save(group);

    logger.info(`Group booking ${groupBookingId} confirmed with ${group.members.length} members`);

    // Send confirmation emails
    await this.sendGroupConfirmationEmails(group);
  }

  /**
   * Send confirmation emails to all members
   */
  private async sendGroupConfirmationEmails(group: GroupBooking): Promise<void> {
    for (const member of group.members) {
      const subject = `Group booking confirmed: ${group.groupName}`;
      const body = `
        <h2>Group Booking Confirmed</h2>
        <p>Your group booking for <strong>${group.groupName}</strong> has been confirmed.</p>
        <p>You can view your booking details at: ${process.env.FRONTEND_URL}/bookings</p>
        <p>Shared Itinerary: ${group.sharedItinerary || 'Not available yet'}</p>
      `;

      await this.notificationService.sendEmail(member.email, subject, body);
    }
  }

  /**
   * Get group booking by ID
   */
  async getGroupBooking(groupBookingId: string): Promise<GroupBooking | null> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);

    return await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });
  }

  /**
   * Get group booking by invite token
   */
  async getGroupBookingByToken(token: string): Promise<{ group: GroupBooking; member: GroupMember } | null> {
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const member = await memberRepo.findOne({
      where: { inviteToken: token },
      relations: ['groupBooking'],
    });

    if (!member) {
      return null;
    }

    return {
      group: member.groupBooking,
      member,
    };
  }

  /**
   * Get all group bookings for a user email
   */
  async getGroupBookingsByEmail(email: string): Promise<GroupBooking[]> {
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const members = await memberRepo.find({
      where: { email },
      relations: ['groupBooking', 'groupBooking.members'],
    });

    return members.map((m) => m.groupBooking);
  }

  /**
   * Cancel group booking
   */
  async cancelGroupBooking(groupBookingId: string, reason: string): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) {
      throw new Error('Group booking not found');
    }

    if (group.status === 'confirmed' || group.status === 'cancelled') {
      throw new Error('Group booking cannot be cancelled');
    }

    group.status = 'cancelled';
    group.notes = reason;
    await groupBookingRepo.save(group);

    // Notify all members
    for (const member of group.members) {
      const subject = `Group booking cancelled: ${group.groupName}`;
      const body = `
        <h2>Group Booking Cancelled</h2>
        <p>The group booking for <strong>${group.groupName}</strong> has been cancelled.</p>
        <p>Reason: ${reason}</p>
        <p>Please contact ${group.organizerEmail} for more information.</p>
      `;

      await this.notificationService.sendEmail(member.email, subject, body);
    }

    logger.info(`Group booking ${groupBookingId} cancelled: ${reason}`);

    return group;
  }

  /**
   * Update shared itinerary
   */
  async updateSharedItinerary(groupBookingId: string, itinerary: string): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
    });

    if (!group) {
      throw new Error('Group booking not found');
    }

    group.sharedItinerary = itinerary;
    await groupBookingRepo.save(group);

    return group;
  }
}