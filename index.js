'use strict';

/**
 * Module dependencies.
 */

const isEmpty = require('lodash.isempty');
const castArray = require('lodash.castarray');
const compact = require('lodash.compact');
const util = require('util');

/**
 * Export `unique`.
 */

module.exports = options => {
  options = Object.assign({
    identifiers: ['id']
  }, options);

  return Model => {
    return class extends Model {

      /**
       * Before insert.
       */

      $beforeInsert(context) {
        const parent = super.$beforeInsert(context);

        if (isEmpty(options.fields) || isEmpty(options.identifiers)) {
          throw new Error('Fields and identifiers options must be defined.');
        }

        return this.queryResolver(parent);
      }

      /**
       * Before update.
       */

      $beforeUpdate(queryOptions, context) {
        const parent = super.$beforeUpdate(queryOptions, context);

        if (isEmpty(options.fields) || isEmpty(options.identifiers)) {
          throw new Error('Fields and identifiers options must be defined.');
        }

        if (isEmpty(queryOptions.old)) {
          return parent;
          //throw new Error('Unique validation at update only works with queries started with $query.');
        }

        return this.queryResolver(parent, true, queryOptions);
      }

      /**
       * Query resolver.
       */

      queryResolver(parent, update = false, queryOptions = {}) {
        return Promise.resolve(parent)
          .then(() => Promise.all(this.getQuery(update, queryOptions)))
          .then(rows => {
            const errors = this.parseErrors(rows);

            if (!isEmpty(errors)) {
              throw Model.createValidationError({
                data: errors,
                message: 'Unique Validation Failed',
                type: 'ModelValidation'
              });
            }
          });
      }

      /**
       * Get select query.
       */

      getQuery(update, queryOptions) {
        return options.fields.reduce((queries, field, index) => {
          const knex = Model.knex();
          const collection = knex(this.constructor.tableName);
          const fields = castArray(field);

          if (isEmpty(compact(fields.map(fieldName => this[fieldName])))) {
            return queries;
          }

          if (compact(fields.map(fieldName => this[fieldName])).length !== fields.length) {
            return queries;
          }

          const query = (
            fields.reduce(
              (subset, fieldName) => subset.where(fieldName, this[fieldName] || queryOptions.old[fieldName]),
              collection.select(),
            )
          ).limit(1);

          if (update) {
            options.identifiers.forEach(identifier =>
              query.andWhereNot(identifier, queryOptions.old[identifier])
            );
          }

          queries[index] = query;

          return queries;
        }, []);
      }

      /**
       * Parse errors.
       */

      parseErrors(rows) {
        return rows.reduce((errors, error, index) => {
          if (!isEmpty(error)) {
            const fields = castArray(options.fields[index]);

            fields.forEach(field => {
              errors[[field]] = [{
                keyword: 'unique',
                message: util.format('%s already in use.', options.fields[index])
              }];
            });
          }

          return errors;
        }, {});
      }
    };
  };
};
