/**
 * Dashboard statistics DTO
 */
export class DashboardStatsDto {
  totalTrees: number;
  totalPersons: number;
  totalSystemAdmins: number;
  recentTrees: TreeSummaryDto[];
  treesCreatedThisMonth: number;
  personsAddedThisMonth: number;
}

export class TreeSummaryDto {
  id: string;
  name: string;
  adminUsername: string;
  personCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class TreeDetailDto extends TreeSummaryDto {
  guestUsername: string;
  ownerEmail?: string;
  persons: PersonSummaryDto[];
}

export class PersonSummaryDto {
  id: number;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female';
  birthDate?: string;
  deathDate?: string;
  progenitor: boolean;
  fatherId?: number;
  motherId?: number;
}

/**
 * Pagination DTOs
 */
export class PaginationQueryDto {
  page?: number;
  limit?: number;
  search?: string;
}

export class PaginatedResponseDto<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Tree export DTO
 */
export class TreeExportDto {
  exportedAt: string;
  tree: {
    id: string;
    name: string;
    adminUsername: string;
    guestUsername: string;
    ownerEmail?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  persons: PersonSummaryDto[];
}
