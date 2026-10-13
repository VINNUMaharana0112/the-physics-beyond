import { PlayIcon } from '@sanity/icons'
import { defineField, defineType } from 'sanity'

function socialVideo(name: 'youtubeVideo' | 'instagramReel', title: string, host: string) {
  return defineType({
    name, title, type: 'document', icon: PlayIcon,
    fields: [
      defineField({ name: 'title', title: 'Video title', type: 'string', validation: (rule) => rule.required().max(150) }),
      defineField({ name: 'slug', title: 'Page address', type: 'slug', options: { source: 'title', maxLength: 96 }, validation: (rule) => rule.required() }),
      defineField({ name: 'description', title: 'Short description', type: 'text', rows: 3, validation: (rule) => rule.required().max(300) }),
      defineField({ name: 'platformUrl', title: `${host} video / reel link`, type: 'url', validation: (rule) => rule.required().uri({ scheme: ['https'], allowRelative: false }) }),
      defineField({ name: 'caption', title: 'Caption or context', type: 'text', rows: 4 }),
      defineField({ name: 'image', title: 'Thumbnail', type: 'image', options: { hotspot: true }, fields: [defineField({ name: 'alt', title: 'Image description', type: 'string', validation: (rule) => rule.required() })] }),
      defineField({ name: 'category', title: 'Topic', type: 'string', options: { list: ['Physics', 'Space & Cosmology', 'Quantum Physics', 'Relativity', 'Behind the scenes', 'Other'] } }),
      defineField({ name: 'publishedAt', title: 'Publication date', type: 'datetime', initialValue: () => new Date().toISOString() })
    ],
    preview: { select: { title: 'title', subtitle: 'category', media: 'image' } }
  })
}

export const youtubeVideo = socialVideo('youtubeVideo', 'YouTube video', 'YouTube')
export const instagramReel = socialVideo('instagramReel', 'Instagram Reel', 'Instagram')
