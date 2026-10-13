import { BookIcon, DownloadIcon, LinkIcon } from '@sanity/icons'
import { defineField, defineType } from 'sanity'

const commonFields = [
  defineField({ name: 'title', title: 'Product name', type: 'string', validation: (rule) => rule.required().max(150) }),
  defineField({ name: 'slug', title: 'Page address', type: 'slug', options: { source: 'title', maxLength: 96 }, validation: (rule) => rule.required() }),
  defineField({ name: 'description', title: 'Description', type: 'text', rows: 4, validation: (rule) => rule.required().max(1000) }),
  defineField({ name: 'image', title: 'Cover or product image', type: 'image', options: { hotspot: true }, fields: [defineField({ name: 'alt', title: 'Image description', type: 'string', validation: (rule) => rule.required() })] }),
  defineField({ name: 'priceDisplay', title: 'Price shown to visitors', type: 'string', description: 'Enter a confirmed amount, or leave blank until known.' }),
  defineField({ name: 'category', title: 'Category', type: 'string' })
]

export const physicalBook = defineType({
  name: 'physicalBook', title: 'Physical book', type: 'document', icon: BookIcon,
  fields: [...commonFields,
    defineField({ name: 'author', title: 'Author', type: 'string' }),
    defineField({ name: 'publisher', title: 'Publisher', type: 'string' }),
    defineField({ name: 'format', title: 'Format / edition', type: 'string', description: 'For example: paperback, hardback, edition details.' }),
    defineField({ name: 'availability', title: 'Availability', type: 'string', description: 'For example: Available by enquiry.' }),
    defineField({ name: 'shippingDetails', title: 'Shipping details', type: 'text', rows: 3 }),
    defineField({ name: 'deliveryEstimate', title: 'Estimated delivery', type: 'string' }),
    defineField({ name: 'whatIsIncluded', title: 'What the reader receives', type: 'text', rows: 3 }),
    defineField({ name: 'purchaseUrl', title: 'External checkout / enquiry link', type: 'url', description: 'Optional. Leave empty to show the site enquiry option.', validation: (rule) => rule.uri({ scheme: ['https', 'mailto'], allowRelative: false }) }),
    defineField({ name: 'publishedAt', title: 'Listed since', type: 'datetime', initialValue: () => new Date().toISOString() })
  ],
  preview: { select: { title: 'title', subtitle: 'priceDisplay', media: 'image' } }
})

export const digitalProduct = defineType({
  name: 'digitalProduct', title: 'Digital product', type: 'document', icon: DownloadIcon,
  fields: [...commonFields,
    defineField({ name: 'format', title: 'File / product format', type: 'string', description: 'For example: PDF, EPUB, worksheet pack.' }),
    defineField({ name: 'whatIsIncluded', title: 'What the customer receives', type: 'text', rows: 4 }),
    defineField({ name: 'availability', title: 'Availability', type: 'string', initialValue: 'Coming soon' }),
    defineField({ name: 'isFree', title: 'This is a free public download', type: 'boolean', initialValue: false, description: 'Only check this when the download is intentionally public.' }),
    defineField({ name: 'freeDownloadUrl', title: 'Public download link', type: 'url', hidden: ({ parent }) => parent?.isFree !== true, validation: (rule) => rule.uri({ scheme: ['https'], allowRelative: false }) }),
    defineField({ name: 'purchaseUrl', title: 'External checkout link', type: 'url', description: 'Optional. Use a hosted checkout if you already have one.', validation: (rule) => rule.uri({ scheme: ['https'], allowRelative: false }) }),
    defineField({ name: 'deliveryDetails', title: 'Delivery note', type: 'text', rows: 2 }),
    defineField({ name: 'publishedAt', title: 'Listed since', type: 'datetime', initialValue: () => new Date().toISOString() })
  ],
  preview: { select: { title: 'title', subtitle: 'priceDisplay', media: 'image' } }
})

export const affiliateProduct = defineType({
  name: 'affiliateProduct', title: 'Affiliate recommendation', type: 'document', icon: LinkIcon,
  fields: [
    defineField({ name: 'title', title: 'Product / book name', type: 'string', validation: (rule) => rule.required().max(150) }),
    defineField({ name: 'slug', title: 'Page address', type: 'slug', options: { source: 'title', maxLength: 96 }, validation: (rule) => rule.required() }),
    defineField({ name: 'description', title: 'Why recommend it?', type: 'text', rows: 4, validation: (rule) => rule.required().max(1000) }),
    defineField({ name: 'image', title: 'Product image', type: 'image', options: { hotspot: true }, fields: [defineField({ name: 'alt', title: 'Image description', type: 'string', validation: (rule) => rule.required() })] }),
    defineField({ name: 'affiliateUrl', title: 'Your affiliate link', type: 'url', validation: (rule) => rule.required().uri({ scheme: ['https'], allowRelative: false }) }),
    defineField({ name: 'disclosure', title: 'Affiliate disclosure', type: 'string', initialValue: 'This is an affiliate link. We may earn a commission if you buy through it, at no extra cost to you.', validation: (rule) => rule.required().max(300) }),
    defineField({ name: 'category', title: 'Topic', type: 'string' }),
    defineField({ name: 'publishedAt', title: 'Recommendation date', type: 'datetime', initialValue: () => new Date().toISOString() })
  ],
  preview: { select: { title: 'title', subtitle: 'category', media: 'image' } }
})
