import { DocumentTextIcon } from '@sanity/icons'
import { defineArrayMember, defineField, defineType } from 'sanity'

export const article = defineType({
  name: 'article',
  title: 'Article',
  type: 'document',
  icon: DocumentTextIcon,
  groups: [
    { name: 'content', title: 'Article content', default: true },
    { name: 'details', title: 'Publishing details' }
  ],
  fields: [
    defineField({ name: 'title', title: 'Article title', type: 'string', group: 'content', validation: (rule) => rule.required().max(150) }),
    defineField({ name: 'slug', title: 'Page address', type: 'slug', group: 'content', options: { source: 'title', maxLength: 96 }, validation: (rule) => rule.required() }),
    defineField({ name: 'description', title: 'Short introduction', type: 'text', rows: 3, group: 'content', validation: (rule) => rule.required().max(300) }),
    defineField({ name: 'body', title: 'Write the article', type: 'array', group: 'content', of: [
      defineArrayMember({ type: 'block', styles: [{ title: 'Paragraph', value: 'normal' }, { title: 'Heading 2', value: 'h2' }, { title: 'Heading 3', value: 'h3' }, { title: 'Quote', value: 'blockquote' }], marks: { decorators: [{ title: 'Bold', value: 'strong' }, { title: 'Italic', value: 'em' }], annotations: [defineArrayMember({ name: 'link', title: 'Link', type: 'object', fields: [defineField({ name: 'href', title: 'Web address', type: 'url', validation: (rule) => rule.uri({ scheme: ['http', 'https'] }) })] })] }, of: [defineArrayMember({ type: 'image', options: { hotspot: true }, fields: [defineField({ name: 'alt', title: 'Image description', type: 'string', validation: (rule) => rule.required() })] })] }),
      defineArrayMember({ type: 'image', options: { hotspot: true }, fields: [defineField({ name: 'alt', title: 'Image description', type: 'string', validation: (rule) => rule.required() })] })
    ], validation: (rule) => rule.required().min(1) }),
    defineField({ name: 'image', title: 'Featured image', type: 'image', group: 'content', options: { hotspot: true }, fields: [defineField({ name: 'alt', title: 'Image description', type: 'string', validation: (rule) => rule.required() })] }),
    defineField({ name: 'category', title: 'Topic', type: 'string', group: 'details', options: { list: ['Physics', 'Space & Cosmology', 'Quantum Physics', 'Relativity', 'Technology', 'Science'] } }),
    defineField({ name: 'author', title: 'Author', type: 'string', group: 'details', initialValue: 'The Physics Beyond' }),
    defineField({ name: 'publishedAt', title: 'Publication date', type: 'datetime', group: 'details', initialValue: () => new Date().toISOString() }),
    defineField({ name: 'featured', title: 'Feature at the top of the article list', type: 'boolean', group: 'details', initialValue: false })
  ],
  preview: { select: { title: 'title', subtitle: 'category', media: 'image' } }
})
