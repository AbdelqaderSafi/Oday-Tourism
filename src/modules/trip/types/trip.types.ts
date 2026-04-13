import { DestinatiosnEnum } from 'generated/prisma/client';
import { PaginationQueryType } from 'src/types/util.types';

export type TripQuery = PaginationQueryType & {
  city?: DestinatiosnEnum;
};
