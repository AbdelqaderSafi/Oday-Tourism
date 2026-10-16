import { Asset, DestinatiosnEnum } from 'generated/prisma/client';

export type DestinationResponseDTO = {
  destination: DestinatiosnEnum;
  image: Asset | null;
  hotels_count: number;
  trips_count: number;
};

export type DestinationQuery = {
  type?: 'hotels' | 'trips';
};
