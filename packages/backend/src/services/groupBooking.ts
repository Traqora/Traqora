import { AppDataSource } from '../db/dataSource';
import { GroupBooking, GroupApprovalStatus } from '../db/entities/GroupBooking';
import { GroupMember } from '../db/entities/GroupMember';
import { Booking } from '../db/entities/Booking';
import { Flight } from '../db/entities/Flight';
import { Passenger } from '../db/entities/Passenger';
import { CorporateAccount, CorporateAccountStatus } from '../db/entities/CorporateAccount';
import { CorporateUser, CorporateUserRole } from '../db/entities/CorporateUser';
import { CorporateBookingPolicy, FareClass } from '../db/entities/CorporateBookingPolicy';
import { BookingApproval } from '../db/entities/BookingApproval';
import { CheckIn } from '../db/entities/CheckIn';
import { notificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
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
  corporateAccountId?: string;
  costCenter?: string;
  department?: string;
  bookingPolicyId?: string;
}

export interface GroupMemberInput {
  email: string;
  firstName?: string;
  lastName?: string;
  stellarAddress?: string;
  shareAmountCents?: number;
  employeeId?: string;
  department?: string;
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

export interface CreateCorporateAccountRequest {
  companyName: string;
  email: string;
  registrationNumber?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  industry?: string;
  creditLimitCents?: number;
  paymentTermsDays?: number;
}

export interface AddCorporateUserRequest {
  corporateAccountId: string;
  userId: string;
  role: CorporateUserRole;
  department?: string;
  costCenter?: string;
  permissions?: Record<string, boolean>;
}

export interface CreateBookingPolicyRequest {
  corporateAccountId: string;
  name: string;
  description?: string;
  maxBookingAmountCents?: number;
  allowedFareClasses?: FareClass[];
  maxAdvanceBookingDays?: number;
  requiresApproval?: boolean;
  approvalThresholdCents?: number;
  preferredAirlines?: string[];
  blacklistedAirlines?: string[];
}

export interface ApprovalRequest {
  groupBookingId: string;
  requestedBy: string;
  requestReason?: string;
  corporateAccountId?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface GroupInvoice {
  invoiceNumber: string;
  groupBookingId: string;
  corporateAccountId?: string;
  companyName?: string;
  issuedAt: Date;
  dueAt: Date;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled';
}

export class GroupBookingService {
  private static instance: GroupBookingService;

  private constructor() {}

  public static getInstance(): GroupBookingService {
    if (!GroupBookingService.instance) {
      GroupBookingService.instance = new GroupBookingService();
    }
    return GroupBookingService.instance;
  }

  async createGroupBooking(request: CreateGroupBookingRequest): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const flightRepo = AppDataSource.getRepository(Flight);

    const flight = await flightRepo.findOne({ where: { id: request.flightId } });
    if (!flight) throw new BadRequestError('Flight not found');

    if (flight.seatsAvailable < request.memberEmails.length + 1) {
      throw new BadRequestError('Not enough seats available for all group members');
    }

    const totalAmountCents = (request.memberEmails.length + 1) * flight.priceCents;

    let approvalStatus: GroupApprovalStatus = 'not_required';

    if (request.corporateAccountId) {
      const policyRepo = AppDataSource.getRepository(CorporateBookingPolicy);

      if (request.bookingPolicyId) {
        const policy = await policyRepo.findOne({ where: { id: request.bookingPolicyId } });
        if (policy?.requiresApproval) {
          approvalStatus = 'pending';
        }
      } else {
        const policies = await policyRepo.find({
          where: { corporateAccountId: request.corporateAccountId },
        });
        if (policies.some((p) => p.requiresApproval)) {
          approvalStatus = 'pending';
        }
      }
    }

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
      corporateAccountId: request.corporateAccountId || null,
      costCenter: request.costCenter || null,
      department: request.department || null,
      bookingPolicyId: request.bookingPolicyId || null,
      approvalStatus,
    });

    const savedGroup = await groupBookingRepo.save(groupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);
    const members: GroupMember[] = [];

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

    for (const email of request.memberEmails) {
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
    await this.calculateMemberShares(savedGroup.id);

    logger.info(`Group booking created: ${savedGroup.id} with ${members.length} members`);

    return savedGroup;
  }

  async calculateMemberShares(groupBookingId: string): Promise<void> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) throw new BadRequestError('Group booking not found');

    const confirmedMembers = group.members.filter(
      (m) => m.status === 'confirmed' || m.role === 'organizer',
    );

    if (confirmedMembers.length === 0) return;

    const shares: Record<string, number> = {};

    switch (group.splitMethod) {
      case 'equal': {
        const equalShare = Math.floor(group.totalAmountCents / confirmedMembers.length);
        for (const member of confirmedMembers) {
          shares[member.id] = equalShare;
        }
        const remainder =
          group.totalAmountCents - equalShare * confirmedMembers.length;
        if (remainder > 0 && confirmedMembers.length > 0) {
          shares[confirmedMembers[0].id] = equalShare + remainder;
        }
        break;
      }
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
            shares[member.id] = Math.floor(
              (group.totalAmountCents * percentage) / 100,
            );
          }
        }
        break;
    }

    for (const member of confirmedMembers) {
      if (shares[member.id] !== undefined) {
        member.shareAmountCents = shares[member.id];
        await memberRepo.save(member);
      }
    }

    logger.info(`Member shares calculated for group ${groupBookingId}`);
  }

  async inviteMembers(request: InviteMembersRequest): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const group = await groupBookingRepo.findOne({
      where: { id: request.groupBookingId },
      relations: ['members'],
    });

    if (!group) throw new BadRequestError('Group booking not found');
    if (group.status === 'confirmed' || group.status === 'cancelled') {
      throw new BadRequestError('Group booking is already confirmed or cancelled');
    }

    const newMembers: GroupMember[] = [];

    for (const email of request.memberEmails) {
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
      await this.calculateMemberShares(group.id);
    }

    const allMembers = [...group.members, ...newMembers];
    const invitedMembers = allMembers.filter(
      (m) => m.isInvited && m.status === 'pending',
    );

    for (const member of invitedMembers) {
      await this.sendInvitationEmail(member, group);
    }

    group.status = 'inviting';
    await groupBookingRepo.save(group);

    logger.info(
      `Invitations sent for group ${group.id} to ${invitedMembers.length} members`,
    );

    return group;
  }

  private async sendInvitationEmail(
    member: GroupMember,
    group: GroupBooking,
  ): Promise<void> {
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/book/group/invite/${member.inviteToken}`;
    const subject = `You're invited to join a group booking: ${group.groupName}`;
    const body = `
      <h2>Group Booking Invitation</h2>
      <p>You've been invited to join <strong>${group.groupName}</strong>.</p>
      <p>${group.organizerEmail} is organizing a group flight booking.</p>
      <p><a href="${inviteLink}">Click here to accept the invitation</a></p>
      <p>If you have any questions, please contact ${group.organizerEmail}.</p>
    `;

    await notificationService.sendEmail(member.email, subject, body);
    logger.info(`Invitation sent to ${member.email} for group ${group.id}`);
  }

  async acceptInvitation(
    token: string,
    memberData: {
      firstName?: string;
      lastName?: string;
      stellarAddress?: string;
    },
  ): Promise<GroupMember> {
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const member = await memberRepo.findOne({
      where: { inviteToken: token },
      relations: ['groupBooking'],
    });

    if (!member) throw new BadRequestError('Invalid or expired invitation token');
    if (member.status === 'confirmed') {
      throw new BadRequestError('You have already accepted this invitation');
    }

    member.firstName = memberData.firstName || member.firstName;
    member.lastName = memberData.lastName || member.lastName;
    member.stellarAddress = memberData.stellarAddress || member.stellarAddress;
    member.status = 'confirmed';
    member.confirmedAt = new Date();

    await memberRepo.save(member);
    await this.calculateMemberShares(member.groupBookingId);
    await this.checkAllMembersConfirmed(member.groupBookingId);

    logger.info(
      `Member ${member.email} accepted invitation for group ${member.groupBookingId}`,
    );

    return member;
  }

  private async checkAllMembersConfirmed(groupBookingId: string): Promise<void> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const members = await memberRepo.find({
      where: { groupBookingId },
    });

    const allConfirmed = members.every(
      (m) => m.status === 'confirmed' || m.role === 'organizer',
    );

    if (allConfirmed) {
      const group = await groupBookingRepo.findOne({
        where: { id: groupBookingId },
      });

      if (group && group.status === 'inviting') {
        group.status = 'awaiting_payment';
        await groupBookingRepo.save(group);
        logger.info(
          `Group ${groupBookingId} all members confirmed, ready for payment`,
        );
      }
    }
  }

  async updateSplitMethod(
    groupBookingId: string,
    request: UpdateSplitRequest,
  ): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) throw new BadRequestError('Group booking not found');
    if (group.status === 'confirmed' || group.status === 'cancelled') {
      throw new BadRequestError(
        'Cannot update split method after confirmation',
      );
    }

    group.splitMethod = request.splitMethod;
    group.splitConfig = request.splitConfig;

    await groupBookingRepo.save(group);
    await this.calculateMemberShares(groupBookingId);

    logger.info(`Split method updated for group ${groupBookingId}`);

    return group;
  }

  async processMemberPayment(
    groupBookingId: string,
    memberId: string,
    paymentAmountCents: number,
  ): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) throw new BadRequestError('Group booking not found');

    const member = group.members.find((m) => m.id === memberId);
    if (!member) throw new BadRequestError('Member not found');
    if (member.status === 'paid') throw new BadRequestError('Member has already paid');

    if (member.shareAmountCents && paymentAmountCents !== member.shareAmountCents) {
      throw new BadRequestError(
        `Payment amount must be exactly ${member.shareAmountCents} cents`,
      );
    }

    const flightRepo = AppDataSource.getRepository(Flight);
    const flight = await flightRepo.findOne({ where: { id: group.flightId } });
    if (flight && flight.seatsAvailable > 0) {
      await flightRepo.decrement({ id: group.flightId }, 'seatsAvailable', 1);
    }

    member.status = 'paid';
    await memberRepo.save(member);

    group.paidAmountCents = (group.paidAmountCents || 0) + paymentAmountCents;

    const allPaid = group.members.every(
      (m) => m.status === 'paid' || m.role === 'organizer',
    );

    if (allPaid) {
      group.status = 'paid';
      await this.confirmGroupBooking(group.id);
    } else {
      group.status = 'partial_paid';
    }

    await groupBookingRepo.save(group);
    logger.info(
      `Payment processed for member ${memberId} in group ${groupBookingId}`,
    );

    return group;
  }

  private async confirmGroupBooking(groupBookingId: string): Promise<void> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    const bookingRepo = AppDataSource.getRepository(Booking);
    const passengerRepo = AppDataSource.getRepository(Passenger);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) throw new BadRequestError('Group booking not found');

    if (group.approvalStatus === 'pending') {
      logger.info(
        `Group ${groupBookingId} waiting for approval, skipping confirmation`,
      );
      return;
    }

    for (const member of group.members) {
      if (member.status !== 'paid' && member.role !== 'organizer') continue;

      const passenger = passengerRepo.create({
        email: member.email,
        firstName: member.firstName || 'Guest',
        lastName: member.lastName || 'User',
        sorobanAddress: member.stellarAddress || '',
      });

      const savedPassenger = await passengerRepo.save(passenger);

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

    logger.info(
      `Group booking ${groupBookingId} confirmed with ${group.members.length} members`,
    );

    await this.sendGroupConfirmationEmails(group);
  }

  private async sendGroupConfirmationEmails(group: GroupBooking): Promise<void> {
    for (const member of group.members) {
      const subject = `Group booking confirmed: ${group.groupName}`;
      const body = `
        <h2>Group Booking Confirmed</h2>
        <p>Your group booking for <strong>${group.groupName}</strong> has been confirmed.</p>
        <p>You can view your booking details at: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/bookings</p>
        <p>Shared Itinerary: ${group.sharedItinerary || 'Not available yet'}</p>
      `;

      await notificationService.sendEmail(member.email, subject, body);
    }
  }

  async getGroupBooking(groupBookingId: string): Promise<GroupBooking | null> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);
    return groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });
  }

  async getGroupBookingByToken(
    token: string,
  ): Promise<{ group: GroupBooking; member: GroupMember } | null> {
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const member = await memberRepo.findOne({
      where: { inviteToken: token },
      relations: ['groupBooking'],
    });

    if (!member) return null;

    return { group: member.groupBooking, member };
  }

  async getGroupBookingsByEmail(email: string): Promise<GroupBooking[]> {
    const memberRepo = AppDataSource.getRepository(GroupMember);

    const members = await memberRepo.find({
      where: { email },
      relations: ['groupBooking', 'groupBooking.members'],
    });

    return members.map((m) => m.groupBooking);
  }

  async cancelGroupBooking(
    groupBookingId: string,
    reason: string,
  ): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
      relations: ['members'],
    });

    if (!group) throw new BadRequestError('Group booking not found');
    if (group.status === 'confirmed' || group.status === 'cancelled') {
      throw new BadRequestError('Group booking cannot be cancelled');
    }

    group.status = 'cancelled';
    group.notes = reason;
    await groupBookingRepo.save(group);

    for (const member of group.members) {
      const subject = `Group booking cancelled: ${group.groupName}`;
      const body = `
        <h2>Group Booking Cancelled</h2>
        <p>The group booking for <strong>${group.groupName}</strong> has been cancelled.</p>
        <p>Reason: ${reason}</p>
        <p>Please contact ${group.organizerEmail} for more information.</p>
      `;

      await notificationService.sendEmail(member.email, subject, body);
    }

    logger.info(`Group booking ${groupBookingId} cancelled: ${reason}`);

    return group;
  }

  async updateSharedItinerary(
    groupBookingId: string,
    itinerary: string,
  ): Promise<GroupBooking> {
    const groupBookingRepo = AppDataSource.getRepository(GroupBooking);

    const group = await groupBookingRepo.findOne({
      where: { id: groupBookingId },
    });

    if (!group) throw new BadRequestError('Group booking not found');

    group.sharedItinerary = itinerary;
    await groupBookingRepo.save(group);

    return group;
  }

  async checkInAllMembers(
    groupBookingId: string,
    seatAllocations?: Record<string, string>,
  ): Promise<{ checkedIn: number; errors: string[] }> {
    const group = await this.getGroupBooking(groupBookingId);
    if (!group) throw new NotFoundError('Group booking not found');
    if (group.status !== 'confirmed') {
      throw new BadRequestError('Group booking must be confirmed before check-in');
    }

    const bookingRepo = AppDataSource.getRepository(Booking);
    const checkInRepo = AppDataSource.getRepository(CheckIn);

    const bookings = await bookingRepo.find({
      where: { idempotencyKey: `group_${groupBookingId}_%` },
    } as any);

    let checkedIn = 0;
    const errors: string[] = [];

    for (const member of group.members) {
      if (member.status !== 'paid' && member.role !== 'organizer') continue;

      const seatNumber = seatAllocations?.[member.id] || undefined;

      try {
        const existingCheckIn = await checkInRepo.findOne({
          where: { booking: { id: bookings.find((b) => b.idempotencyKey === `group_${groupBookingId}_member_${member.id}`)?.id } } as any,
        });

        if (existingCheckIn?.status === 'checked_in') {
          checkedIn++;
          continue;
        }

        const matchingBooking = bookings.find(
          (b) => b.idempotencyKey === `group_${groupBookingId}_member_${member.id}`,
        );

        if (!matchingBooking) {
          errors.push(`No booking found for member ${member.email}`);
          continue;
        }

        const checkIn = checkInRepo.create({
          booking: matchingBooking,
          status: 'checked_in',
          seatNumber: seatNumber || null,
          boardingPassCode: uuidv4().replace(/-/g, '').toUpperCase().slice(0, 16),
          checkedInAt: new Date(),
        });

        await checkInRepo.save(checkIn);
        checkedIn++;

        logger.info(`Group member ${member.email} checked in for group ${groupBookingId}`);
      } catch (err: any) {
        errors.push(`Check-in failed for ${member.email}: ${err.message}`);
      }
    }

    logger.info(
      `Group check-in completed for ${groupBookingId}: ${checkedIn} checked in, ${errors.length} errors`,
    );

    return { checkedIn, errors };
  }

  // Corporate Account Management

  async createCorporateAccount(
    request: CreateCorporateAccountRequest,
  ): Promise<CorporateAccount> {
    const repo = AppDataSource.getRepository(CorporateAccount);

    const existing = await repo.findOne({ where: { email: request.email } } as any);
    if (existing) {
      throw new BadRequestError('An account with this email already exists');
    }

    const account = repo.create({
      companyName: request.companyName,
      email: request.email,
      registrationNumber: request.registrationNumber || null,
      taxId: request.taxId || null,
      phone: request.phone || null,
      address: request.address || null,
      industry: request.industry || null,
      creditLimitCents: request.creditLimitCents || 0,
      paymentTermsDays: request.paymentTermsDays || 30,
      status: 'active',
    });

    const saved = await repo.save(account);

    logger.info(`Corporate account created: ${saved.id} for ${request.companyName}`);

    return saved;
  }

  async getCorporateAccount(id: string): Promise<CorporateAccount | null> {
    const repo = AppDataSource.getRepository(CorporateAccount);
    const account = await repo.findOne({
      where: { id },
      relations: ['users', 'bookingPolicies'],
    });
    return account;
  }

  async updateCorporateAccount(
    id: string,
    updates: Partial<CreateCorporateAccountRequest>,
  ): Promise<CorporateAccount> {
    const repo = AppDataSource.getRepository(CorporateAccount);
    const account = await repo.findOne({ where: { id } });
    if (!account) throw new NotFoundError('Corporate account not found');

    Object.assign(account, updates);
    const saved = await repo.save(account);

    logger.info(`Corporate account updated: ${id}`);
    return saved;
  }

  async suspendCorporateAccount(id: string, reason: string): Promise<CorporateAccount> {
    const repo = AppDataSource.getRepository(CorporateAccount);
    const account = await repo.findOne({ where: { id } });
    if (!account) throw new NotFoundError('Corporate account not found');

    account.status = 'suspended';
    account.notes = reason;
    await repo.save(account);

    logger.info(`Corporate account suspended: ${id} - ${reason}`);
    return account;
  }

  async listCorporateAccounts(params: {
    status?: CorporateAccountStatus;
    page?: number;
    limit?: number;
  }): Promise<{ accounts: CorporateAccount[]; total: number }> {
    const repo = AppDataSource.getRepository(CorporateAccount);
    const where: any = {};
    if (params.status) where.status = params.status;

    const [accounts, total] = await repo.findAndCount({
      where,
      skip: ((params.page || 1) - 1) * (params.limit || 20),
      take: params.limit || 20,
      order: { createdAt: 'DESC' },
    });

    return { accounts, total };
  }

  async addCorporateUser(request: AddCorporateUserRequest): Promise<CorporateUser> {
    const accountRepo = AppDataSource.getRepository(CorporateAccount);
    const userRepo = AppDataSource.getRepository(CorporateUser);

    const account = await accountRepo.findOne({ where: { id: request.corporateAccountId } });
    if (!account) throw new NotFoundError('Corporate account not found');

    const existing = await userRepo.findOne({
      where: {
        corporateAccountId: request.corporateAccountId,
        userId: request.userId,
      },
    } as any);
    if (existing) {
      throw new BadRequestError('User is already a member of this corporate account');
    }

    const corporateUser = userRepo.create({
      corporateAccountId: request.corporateAccountId,
      userId: request.userId,
      role: request.role,
      department: request.department || null,
      costCenter: request.costCenter || null,
      permissions: request.permissions || null,
    });

    const saved = await userRepo.save(corporateUser);

    logger.info(
      `Corporate user added: ${request.userId} as ${request.role} to account ${request.corporateAccountId}`,
    );

    return saved;
  }

  async updateCorporateUserRole(
    corporateAccountId: string,
    userId: string,
    role: CorporateUserRole,
  ): Promise<CorporateUser> {
    const repo = AppDataSource.getRepository(CorporateUser);
    const cu = await repo.findOne({ where: { corporateAccountId, userId } } as any);
    if (!cu) throw new NotFoundError('Corporate user not found');

    cu.role = role;
    const saved = await repo.save(cu);

    logger.info(`Corporate user ${userId} role updated to ${role}`);
    return saved;
  }

  async removeCorporateUser(
    corporateAccountId: string,
    userId: string,
  ): Promise<void> {
    const repo = AppDataSource.getRepository(CorporateUser);
    const cu = await repo.findOne({ where: { corporateAccountId, userId } } as any);
    if (!cu) throw new NotFoundError('Corporate user not found');

    await repo.remove(cu);
    logger.info(`Corporate user ${userId} removed from account ${corporateAccountId}`);
  }

  async listCorporateUsers(
    corporateAccountId: string,
  ): Promise<CorporateUser[]> {
    const repo = AppDataSource.getRepository(CorporateUser);
    return repo.find({
      where: { corporateAccountId },
      order: { createdAt: 'DESC' },
    });
  }

  // Booking Policies

  async createBookingPolicy(
    request: CreateBookingPolicyRequest,
  ): Promise<CorporateBookingPolicy> {
    const accountRepo = AppDataSource.getRepository(CorporateAccount);
    const policyRepo = AppDataSource.getRepository(CorporateBookingPolicy);

    const account = await accountRepo.findOne({
      where: { id: request.corporateAccountId },
    });
    if (!account) throw new NotFoundError('Corporate account not found');

    const policy = policyRepo.create({
      corporateAccountId: request.corporateAccountId,
      name: request.name,
      description: request.description || null,
      maxBookingAmountCents: request.maxBookingAmountCents || null,
      allowedFareClasses: request.allowedFareClasses || ['economy'],
      maxAdvanceBookingDays: request.maxAdvanceBookingDays || null,
      requiresApproval: request.requiresApproval ?? true,
      approvalThresholdCents: request.approvalThresholdCents || null,
      preferredAirlines: request.preferredAirlines || null,
      blacklistedAirlines: request.blacklistedAirlines || null,
    });

    const saved = await policyRepo.save(policy);

    logger.info(`Booking policy created: ${saved.id} for account ${request.corporateAccountId}`);

    return saved;
  }

  async listBookingPolicies(corporateAccountId: string): Promise<CorporateBookingPolicy[]> {
    const repo = AppDataSource.getRepository(CorporateBookingPolicy);
    return repo.find({
      where: { corporateAccountId },
      order: { createdAt: 'DESC' },
    });
  }

  async validateBookingAgainstPolicy(
    groupBookingId: string,
  ): Promise<{ valid: boolean; violations: string[] }> {
    const group = await this.getGroupBooking(groupBookingId);
    if (!group) throw new NotFoundError('Group booking not found');
    if (!group.corporateAccountId || !group.bookingPolicyId) {
      return { valid: true, violations: [] };
    }

    const policyRepo = AppDataSource.getRepository(CorporateBookingPolicy);
    const policy = await policyRepo.findOne({
      where: { id: group.bookingPolicyId },
    });
    if (!policy) return { valid: true, violations: [] };

    const violations: string[] = [];

    if (
      policy.maxBookingAmountCents &&
      group.totalAmountCents > policy.maxBookingAmountCents
    ) {
      violations.push(
        `Total amount $${(group.totalAmountCents / 100).toFixed(2)} exceeds policy maximum of $${(policy.maxBookingAmountCents / 100).toFixed(2)}`,
      );
    }

    const flightRepo = AppDataSource.getRepository(Flight);
    const flight = await flightRepo.findOne({ where: { id: group.flightId } });
    if (flight) {
      const now = new Date();
      const daysUntilDeparture = Math.ceil(
        (flight.departureTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (
        policy.maxAdvanceBookingDays &&
        daysUntilDeparture > policy.maxAdvanceBookingDays
      ) {
        violations.push(
          `Booking ${daysUntilDeparture} days in advance exceeds policy maximum of ${policy.maxAdvanceBookingDays} days`,
        );
      }

      if (
        policy.blacklistedAirlines &&
        policy.blacklistedAirlines.includes(flight.airlineCode)
      ) {
        violations.push(
          `Airline ${flight.airlineCode} is blacklisted by corporate policy`,
        );
      }

      if (
        policy.preferredAirlines &&
        policy.preferredAirlines.length > 0 &&
        !policy.preferredAirlines.includes(flight.airlineCode)
      ) {
        violations.push(
          `Airline ${flight.airlineCode} is not in the preferred airlines list`,
        );
      }
    }

    return { valid: violations.length === 0, violations };
  }

  // Approval Workflow

  async requestApproval(request: ApprovalRequest): Promise<BookingApproval> {
    const group = await this.getGroupBooking(request.groupBookingId);
    if (!group) throw new NotFoundError('Group booking not found');

    if (group.approvalStatus === 'approved') {
      throw new BadRequestError('Group booking is already approved');
    }

    const repo = AppDataSource.getRepository(BookingApproval);

    const approval = repo.create({
      groupBookingId: request.groupBookingId,
      requestedBy: request.requestedBy,
      requestReason: request.requestReason || null,
      corporateAccountId: request.corporateAccountId || group.corporateAccountId || null,
      status: 'pending',
    });

    const saved = await repo.save(approval);

    group.approvalStatus = 'pending';
    await AppDataSource.getRepository(GroupBooking).save(group);

    logger.info(
      `Approval requested for group ${request.groupBookingId} by ${request.requestedBy}`,
    );

    return saved;
  }

  async approveBooking(
    approvalId: string,
    approverId: string,
    note?: string,
  ): Promise<BookingApproval> {
    const repo = AppDataSource.getRepository(BookingApproval);

    const approval = await repo.findOne({ where: { id: approvalId } });
    if (!approval) throw new NotFoundError('Approval request not found');
    if (approval.status !== 'pending') {
      throw new BadRequestError(`Approval is already ${approval.status}`);
    }

    approval.status = 'approved';
    approval.approverId = approverId;
    approval.approvalNote = note || null;
    approval.approvalDate = new Date();

    await repo.save(approval);

    const groupRepo = AppDataSource.getRepository(GroupBooking);
    const group = await groupRepo.findOne({
      where: { id: approval.groupBookingId },
    });
    if (group) {
      group.approvalStatus = 'approved';
      await groupRepo.save(group);

      if (group.status === 'paid') {
        await this.confirmGroupBooking(group.id);
      }
    }

    logger.info(`Booking ${approval.groupBookingId} approved by ${approverId}`);

    return approval;
  }

  async rejectBooking(
    approvalId: string,
    approverId: string,
    reason: string,
  ): Promise<BookingApproval> {
    const repo = AppDataSource.getRepository(BookingApproval);

    const approval = await repo.findOne({ where: { id: approvalId } });
    if (!approval) throw new NotFoundError('Approval request not found');
    if (approval.status !== 'pending') {
      throw new BadRequestError(`Approval is already ${approval.status}`);
    }

    approval.status = 'rejected';
    approval.approverId = approverId;
    approval.rejectionReason = reason;
    approval.approvalDate = new Date();

    await repo.save(approval);

    const groupRepo = AppDataSource.getRepository(GroupBooking);
    const group = await groupRepo.findOne({
      where: { id: approval.groupBookingId },
    });
    if (group) {
      group.approvalStatus = 'rejected';
      await groupRepo.save(group);
    }

    logger.info(`Booking ${approval.groupBookingId} rejected by ${approverId}`);

    return approval;
  }

  async listPendingApprovals(corporateAccountId: string): Promise<BookingApproval[]> {
    const repo = AppDataSource.getRepository(BookingApproval);
    return repo.find({
      where: { corporateAccountId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
  }

  async getApprovalsForGroup(groupBookingId: string): Promise<BookingApproval[]> {
    const repo = AppDataSource.getRepository(BookingApproval);
    return repo.find({
      where: { groupBookingId },
      order: { createdAt: 'DESC' },
    });
  }

  // Billing & Invoicing

  async generateInvoice(groupBookingId: string): Promise<GroupInvoice> {
    const group = await this.getGroupBooking(groupBookingId);
    if (!group) throw new NotFoundError('Group booking not found');

    const lineItems: InvoiceLineItem[] = [];
    let subtotalCents = 0;

    for (const member of group.members) {
      const shareAmount = member.shareAmountCents || 0;
      if (shareAmount > 0) {
        lineItems.push({
          description: `Flight booking - ${member.email}${member.firstName ? ` (${member.firstName} ${member.lastName || ''})` : ''}`,
          quantity: 1,
          unitPriceCents: shareAmount,
          totalCents: shareAmount,
        });
        subtotalCents += shareAmount;
      }
    }

    const taxCents = Math.round(subtotalCents * 0.08);
    const totalCents = subtotalCents + taxCents;

    const invoiceNumber = `INV-${groupBookingId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const dueAt = new Date();
    let paymentTermsDays = 30;

    if (group.corporateAccountId) {
      const accountRepo = AppDataSource.getRepository(CorporateAccount);
      const account = await accountRepo.findOne({
        where: { id: group.corporateAccountId },
      });
      if (account) {
        paymentTermsDays = account.paymentTermsDays;
      }
    }
    dueAt.setDate(dueAt.getDate() + paymentTermsDays);

    const invoice: GroupInvoice = {
      invoiceNumber,
      groupBookingId,
      corporateAccountId: group.corporateAccountId || undefined,
      companyName: undefined,
      issuedAt: new Date(),
      dueAt,
      lineItems,
      subtotalCents,
      taxCents,
      totalCents,
      status: 'draft',
    };

    if (group.corporateAccountId) {
      const accountRepo = AppDataSource.getRepository(CorporateAccount);
      const account = await accountRepo.findOne({
        where: { id: group.corporateAccountId },
      });
      if (account) {
        invoice.companyName = account.companyName;
      }
    }

    const groupRepo = AppDataSource.getRepository(GroupBooking);
    group.invoiceData = invoice as any;
    await groupRepo.save(group);

    logger.info(`Invoice generated for group ${groupBookingId}: ${invoiceNumber}`);

    return invoice;
  }

  async getInvoice(groupBookingId: string): Promise<GroupInvoice | null> {
    const group = await this.getGroupBooking(groupBookingId);
    if (!group) throw new NotFoundError('Group booking not found');
    if (!group.invoiceData) return null;

    return group.invoiceData as unknown as GroupInvoice;
  }

  async listInvoicesByCorporateAccount(
    corporateAccountId: string,
  ): Promise<GroupInvoice[]> {
    const repo = AppDataSource.getRepository(GroupBooking);
    const groups = await repo.find({
      where: { corporateAccountId } as any,
    });

    const invoices: GroupInvoice[] = [];
    for (const group of groups) {
      if (group.invoiceData) {
        invoices.push(group.invoiceData as unknown as GroupInvoice);
      }
    }

    return invoices;
  }

  // Corporate Booking Flow

  async createCorporateGroupBooking(
    request: CreateGroupBookingRequest & {
      corporateAccountId: string;
      userId: string;
    },
  ): Promise<GroupBooking> {
    const accountRepo = AppDataSource.getRepository(CorporateAccount);
    const account = await accountRepo.findOne({
      where: { id: request.corporateAccountId },
    });
    if (!account) throw new NotFoundError('Corporate account not found');
    if (account.status !== 'active') {
      throw new ForbiddenError('Corporate account is not active');
    }

    const userRepo = AppDataSource.getRepository(CorporateUser);
    const corporateUser = await userRepo.findOne({
      where: {
        corporateAccountId: request.corporateAccountId,
        userId: request.userId as any,
      },
    } as any);
    if (!corporateUser) {
      throw new ForbiddenError('User is not a member of this corporate account');
    }

    const group = await this.createGroupBooking(request);

    if (group.approvalStatus === 'pending') {
      await this.requestApproval({
        groupBookingId: group.id,
        requestedBy: request.userId,
        corporateAccountId: request.corporateAccountId,
        requestReason: `Corporate booking for ${account.companyName}`,
      });
    }

    return group;
  }
}
