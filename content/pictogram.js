// Violin pictogram at the start of a figure row, as in the presentation of the experiment:
// red for the Test violin, black for the others. (x, y) is its centre.
export const violinIcon = (g, violin, x, y, size = 32) => g.append('use')
    .attr('href', 'images/icons.svg#violin')
    .attr('x', x - size / 2).attr('y', y - size / 2)
    .attr('width', size).attr('height', size)
    .style('color', violin === 'Klimke' ? 'var(--test)' : 'var(--control)')
