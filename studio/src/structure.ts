import { DocumentTextIcon, PlayIcon, BookIcon, DownloadIcon, LinkIcon } from '@sanity/icons'
import type { StructureResolver } from 'sanity/structure'

export const structure: StructureResolver = (S) => S.list()
  .title('Publish on The Physics Beyond')
  .items([
    S.listItem().title('Articles').icon(DocumentTextIcon).child(S.documentTypeList('article').title('Articles')),
    S.listItem().title('YouTube videos').icon(PlayIcon).child(S.documentTypeList('youtubeVideo').title('YouTube videos')),
    S.listItem().title('Instagram Reels').icon(PlayIcon).child(S.documentTypeList('instagramReel').title('Instagram Reels')),
    S.divider(),
    S.listItem().title('Physical books').icon(BookIcon).child(S.documentTypeList('physicalBook').title('Physical books')),
    S.listItem().title('Digital products').icon(DownloadIcon).child(S.documentTypeList('digitalProduct').title('Digital products')),
    S.listItem().title('Affiliate recommendations').icon(LinkIcon).child(S.documentTypeList('affiliateProduct').title('Affiliate recommendations'))
  ])
